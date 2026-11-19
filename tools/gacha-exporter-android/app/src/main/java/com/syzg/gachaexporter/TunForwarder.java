package com.syzg.gachaexporter;

import android.net.VpnService;

import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.DatagramChannel;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 纯 Java NIO IPv4 透明转发引擎：
 * - 透明转发游戏发出的 UDP (DNS) 与 TCP (443 HTTPS + 游戏逻辑服 9999)
 * - 实时嗅探明文流量中的会话 token、逻辑服 IP:Port 与玩家身份信息
 */
public final class TunForwarder {

    public interface CaptureListener {
        void onTokenCaptured(String token, String serverIp, int serverPort);
        void onPlayerInfoCaptured(String uid, String nickname);
        void onLog(String message);
    }

    private static final int PROTO_TCP = 6;
    private static final int PROTO_UDP = 17;

    private static final int FLAG_FIN = 0x01;
    private static final int FLAG_SYN = 0x02;
    private static final int FLAG_RST = 0x04;
    private static final int FLAG_PSH = 0x08;
    private static final int FLAG_ACK = 0x10;

    private static final Pattern TOKEN_PATTERN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]{12,128})\"");
    private static final Pattern NICK_PATTERN = Pattern.compile("\"nickName\"\\s*:\\s*\"([^\"]{1,40})\"");
    private static final Pattern PLAYER_ID_PATTERN = Pattern.compile("\"playerInfo\"\\s*:\\s*\\{[^}]*\"id\"\\s*:\\s*(\\d+)");

    private final VpnService vpnService;
    private final FileDescriptor tunFd;
    private final CaptureListener listener;

    private volatile boolean running = false;
    private Selector selector;
    private FileOutputStream tunOut;
    private Thread readerThread;
    private Thread selectorThread;

    private final ConcurrentLinkedQueue<byte[]> inboundPackets = new ConcurrentLinkedQueue<>();
    private final Map<String, TcpSession> tcpSessions = new ConcurrentHashMap<>();
    private final Map<String, UdpSession> udpSessions = new ConcurrentHashMap<>();

    private String lastToken = "";
    private String lastNick = "";
    private String lastUid = "";

    private static final class TcpSession {
        final String key;
        final byte[] srcIp;
        final int srcPort;
        final byte[] dstIp;
        final int dstPort;
        final String dstIpStr;
        final SocketChannel channel;
        SelectionKey selKey;

        long clientSeq;
        long serverSeq;
        int ipId = 1;
        boolean connected = false;
        boolean finReceivedFromClient = false;
        boolean finSentToClient = false;
        long lastActiveMs = System.currentTimeMillis();
        final Queue<ByteBuffer> toServerQueue = new ArrayDeque<>();
        final StringBuilder inspectBuf = new StringBuilder();

        TcpSession(String key, byte[] srcIp, int srcPort, byte[] dstIp, int dstPort, String dstIpStr, SocketChannel channel, long clientSeq) {
            this.key = key;
            this.srcIp = srcIp;
            this.srcPort = srcPort;
            this.dstIp = dstIp;
            this.dstPort = dstPort;
            this.dstIpStr = dstIpStr;
            this.channel = channel;
            this.clientSeq = clientSeq;
            this.serverSeq = (100000L + (System.nanoTime() & 0xFFFFFL)) & 0xFFFFFFFFL;
        }
    }

    private static final class UdpSession {
        final String key;
        final byte[] srcIp;
        final int srcPort;
        final byte[] dstIp;
        final int dstPort;
        final DatagramChannel channel;
        SelectionKey selKey;
        long lastActiveMs = System.currentTimeMillis();

        UdpSession(String key, byte[] srcIp, int srcPort, byte[] dstIp, int dstPort, DatagramChannel channel) {
            this.key = key;
            this.srcIp = srcIp;
            this.srcPort = srcPort;
            this.dstIp = dstIp;
            this.dstPort = dstPort;
            this.channel = channel;
        }
    }

    public TunForwarder(VpnService vpnService, FileDescriptor tunFd, CaptureListener listener) {
        this.vpnService = vpnService;
        this.tunFd = tunFd;
        this.listener = listener;
    }

    public void start() throws IOException {
        running = true;
        selector = Selector.open();
        tunOut = new FileOutputStream(tunFd);

        readerThread = new Thread(this::readTunLoop, "TunReader");
        readerThread.start();

        selectorThread = new Thread(this::selectorLoop, "TunSelector");
        selectorThread.start();
    }

    public void stop() {
        running = false;
        try {
            if (selector != null) selector.wakeup();
        } catch (Exception ignored) {}

        for (TcpSession s : tcpSessions.values()) {
            try { s.channel.close(); } catch (Exception ignored) {}
        }
        tcpSessions.clear();

        for (UdpSession s : udpSessions.values()) {
            try { s.channel.close(); } catch (Exception ignored) {}
        }
        udpSessions.clear();

        try {
            if (selector != null) selector.close();
        } catch (Exception ignored) {}
    }

    private void readTunLoop() {
        FileInputStream tunIn = new FileInputStream(tunFd);
        byte[] buf = new byte[32768];
        while (running) {
            try {
                int len = tunIn.read(buf);
                if (len > 0) {
                    byte[] pkt = new byte[len];
                    System.arraycopy(buf, 0, pkt, 0, len);
                    inboundPackets.offer(pkt);
                    selector.wakeup();
                } else if (len < 0) {
                    break;
                }
            } catch (Exception e) {
                if (running && listener != null) {
                    listener.onLog("[!] TUN 读取中断: " + e.getMessage());
                }
                break;
            }
        }
    }

    private void selectorLoop() {
        long lastGc = System.currentTimeMillis();
        while (running) {
            try {
                selector.select(200);

                byte[] pkt;
                while ((pkt = inboundPackets.poll()) != null) {
                    handleInboundIpPacket(pkt);
                }

                Iterator<SelectionKey> it = selector.selectedKeys().iterator();
                while (it.hasNext()) {
                    SelectionKey key = it.next();
                    it.remove();
                    if (!key.isValid()) continue;

                    Object att = key.attachment();
                    if (att instanceof TcpSession) {
                        handleTcpChannelEvent(key, (TcpSession) att);
                    } else if (att instanceof UdpSession) {
                        handleUdpChannelEvent(key, (UdpSession) att);
                    }
                }

                long now = System.currentTimeMillis();
                if (now - lastGc > 10000) {
                    lastGc = now;
                    cleanupIdleSessions(now);
                }
            } catch (Exception e) {
                if (running && listener != null) {
                    listener.onLog("[!] 转发循环异常: " + e.getMessage());
                }
            }
        }
    }

    private void handleInboundIpPacket(byte[] pkt) {
        if (pkt.length < 20) return;
        int version = (pkt[0] >> 4) & 0x0F;
        if (version != 4) return;

        int ihl = (pkt[0] & 0x0F) * 4;
        if (ihl < 20 || pkt.length < ihl) return;

        int totalLen = u16(pkt, 2);
        if (totalLen > pkt.length) totalLen = pkt.length;

        int proto = pkt[9] & 0xFF;
        byte[] srcIp = new byte[]{pkt[12], pkt[13], pkt[14], pkt[15]};
        byte[] dstIp = new byte[]{pkt[16], pkt[17], pkt[18], pkt[19]};

        if (proto == PROTO_UDP) {
            handleInboundUdp(pkt, ihl, totalLen, srcIp, dstIp);
        } else if (proto == PROTO_TCP) {
            handleInboundTcp(pkt, ihl, totalLen, srcIp, dstIp);
        }
    }

    private void handleInboundUdp(byte[] pkt, int ihl, int totalLen, byte[] srcIp, byte[] dstIp) {
        if (totalLen < ihl + 8) return;
        int srcPort = u16(pkt, ihl);
        int dstPort = u16(pkt, ihl + 2);
        int payloadOffset = ihl + 8;
        int payloadLen = totalLen - payloadOffset;
        if (payloadLen < 0) return;

        String dstIpStr = ipToStr(dstIp);
        String key = ipToStr(srcIp) + ":" + srcPort + "->" + dstIpStr + ":" + dstPort;
        UdpSession session = udpSessions.get(key);
        try {
            if (session == null) {
                DatagramChannel ch = DatagramChannel.open();
                ch.configureBlocking(false);
                vpnService.protect(ch.socket());
                ch.connect(new InetSocketAddress(InetAddress.getByAddress(dstIp), dstPort));
                session = new UdpSession(key, srcIp, srcPort, dstIp, dstPort, ch);
                session.selKey = ch.register(selector, SelectionKey.OP_READ, session);
                udpSessions.put(key, session);
            }
            session.lastActiveMs = System.currentTimeMillis();
            ByteBuffer bb = ByteBuffer.wrap(pkt, payloadOffset, payloadLen);
            session.channel.write(bb);
        } catch (Exception e) {
            if (session != null) closeUdpSession(session);
        }
    }

    private void handleUdpChannelEvent(SelectionKey key, UdpSession session) {
        if (!key.isReadable()) return;
        ByteBuffer buf = ByteBuffer.allocate(4096);
        try {
            int n = session.channel.read(buf);
            if (n > 0) {
                session.lastActiveMs = System.currentTimeMillis();
                byte[] resp = new byte[n];
                buf.flip();
                buf.get(resp);
                sendUdpPacketToTun(session.dstIp, session.dstPort, session.srcIp, session.srcPort, resp);
            }
        } catch (Exception e) {
            closeUdpSession(session);
        }
    }

    private void handleInboundTcp(byte[] pkt, int ihl, int totalLen, byte[] srcIp, byte[] dstIp) {
        if (totalLen < ihl + 20) return;
        int srcPort = u16(pkt, ihl);
        int dstPort = u16(pkt, ihl + 2);
        long seq = u32(pkt, ihl + 4);
        int dataOffset = ((pkt[ihl + 12] & 0xF0) >>> 4) * 4;
        if (dataOffset < 20 || totalLen < ihl + dataOffset) return;

        int flags = pkt[ihl + 13] & 0xFF;
        int payloadOffset = ihl + dataOffset;
        int payloadLen = totalLen - payloadOffset;

        String dstIpStr = ipToStr(dstIp);
        String key = ipToStr(srcIp) + ":" + srcPort + "->" + dstIpStr + ":" + dstPort;
        TcpSession session = tcpSessions.get(key);

        if ((flags & FLAG_RST) != 0) {
            if (session != null) closeTcpSession(session);
            return;
        }

        if ((flags & FLAG_SYN) != 0 && (flags & FLAG_ACK) == 0) {
            if (session != null) closeTcpSession(session);
            try {
                SocketChannel ch = SocketChannel.open();
                ch.configureBlocking(false);
                vpnService.protect(ch.socket());
                ch.socket().setTcpNoDelay(true);
                boolean immediate = ch.connect(new InetSocketAddress(InetAddress.getByAddress(dstIp), dstPort));
                session = new TcpSession(key, srcIp, srcPort, dstIp, dstPort, dstIpStr, ch, (seq + 1) & 0xFFFFFFFFL);
                tcpSessions.put(key, session);
                if (immediate) {
                    session.connected = true;
                    sendTcpPacketToTun(session, FLAG_SYN | FLAG_ACK, null, true);
                    session.serverSeq = (session.serverSeq + 1) & 0xFFFFFFFFL;
                    session.selKey = ch.register(selector, SelectionKey.OP_READ, session);
                } else {
                    session.selKey = ch.register(selector, SelectionKey.OP_CONNECT, session);
                }
            } catch (Exception e) {
                sendRawRst(dstIp, dstPort, srcIp, srcPort, 0, (seq + 1) & 0xFFFFFFFFL);
            }
            return;
        }

        if (session == null) {
            // 未知流发 RST 通知客户端重连
            sendRawRst(dstIp, dstPort, srcIp, srcPort, 0, (seq + Math.max(1, payloadLen)) & 0xFFFFFFFFL);
            return;
        }

        session.lastActiveMs = System.currentTimeMillis();

        if (payloadLen > 0) {
            if (seq == session.clientSeq) {
                session.clientSeq = (session.clientSeq + payloadLen) & 0xFFFFFFFFL;
                byte[] data = new byte[payloadLen];
                System.arraycopy(pkt, payloadOffset, data, 0, payloadLen);

                inspectPayload(session, data, true);
                session.toServerQueue.offer(ByteBuffer.wrap(data));
                flushToServer(session);

                sendTcpPacketToTun(session, FLAG_ACK, null, false);
            } else {
                // 重复或乱序包，回发期望 ackNum
                sendTcpPacketToTun(session, FLAG_ACK, null, false);
            }
        }

        if ((flags & FLAG_FIN) != 0) {
            if (!session.finReceivedFromClient) {
                session.finReceivedFromClient = true;
                session.clientSeq = (session.clientSeq + 1) & 0xFFFFFFFFL;
            }
            sendTcpPacketToTun(session, FLAG_ACK, null, false);
            if (!session.finSentToClient) {
                session.finSentToClient = true;
                sendTcpPacketToTun(session, FLAG_FIN | FLAG_ACK, null, false);
                session.serverSeq = (session.serverSeq + 1) & 0xFFFFFFFFL;
            }
            closeTcpSession(session);
        }
    }

    private void handleTcpChannelEvent(SelectionKey key, TcpSession session) {
        try {
            if (key.isConnectable()) {
                if (session.channel.finishConnect()) {
                    session.connected = true;
                    session.lastActiveMs = System.currentTimeMillis();
                    sendTcpPacketToTun(session, FLAG_SYN | FLAG_ACK, null, true);
                    session.serverSeq = (session.serverSeq + 1) & 0xFFFFFFFFL;
                    int ops = SelectionKey.OP_READ | (session.toServerQueue.isEmpty() ? 0 : SelectionKey.OP_WRITE);
                    key.interestOps(ops);
                }
                return;
            }

            if (key.isWritable()) {
                flushToServer(session);
            }

            if (key.isReadable()) {
                ByteBuffer buf = ByteBuffer.allocate(1360);
                for (int round = 0; round < 6; round++) {
                    buf.clear();
                    int n = session.channel.read(buf);
                    if (n > 0) {
                        session.lastActiveMs = System.currentTimeMillis();
                        byte[] data = new byte[n];
                        buf.flip();
                        buf.get(data);
                        inspectPayload(session, data, false);
                        sendTcpPacketToTun(session, FLAG_PSH | FLAG_ACK, data, false);
                        session.serverSeq = (session.serverSeq + n) & 0xFFFFFFFFL;
                    } else if (n < 0) {
                        if (!session.finSentToClient) {
                            session.finSentToClient = true;
                            sendTcpPacketToTun(session, FLAG_FIN | FLAG_ACK, null, false);
                            session.serverSeq = (session.serverSeq + 1) & 0xFFFFFFFFL;
                        }
                        closeTcpSession(session);
                        break;
                    } else {
                        break;
                    }
                }
            }
        } catch (Exception e) {
            sendTcpPacketToTun(session, FLAG_RST | FLAG_ACK, null, false);
            closeTcpSession(session);
        }
    }

    private void flushToServer(TcpSession session) {
        if (!session.connected) return;
        try {
            while (!session.toServerQueue.isEmpty()) {
                ByteBuffer head = session.toServerQueue.peek();
                int written = session.channel.write(head);
                if (head.hasRemaining()) {
                    if (session.selKey != null && session.selKey.isValid()) {
                        session.selKey.interestOps(session.selKey.interestOps() | SelectionKey.OP_WRITE);
                    }
                    return;
                }
                session.toServerQueue.poll();
            }
            if (session.selKey != null && session.selKey.isValid()) {
                session.selKey.interestOps(session.selKey.interestOps() & ~SelectionKey.OP_WRITE);
            }
        } catch (Exception e) {
            sendTcpPacketToTun(session, FLAG_RST | FLAG_ACK, null, false);
            closeTcpSession(session);
        }
    }

    private void inspectPayload(TcpSession session, byte[] data, boolean outbound) {
        if (session.dstPort == 443 || session.dstPort == 80) return;

        String chunk = new String(data, StandardCharsets.UTF_8);
        session.inspectBuf.append(chunk);
        if (session.inspectBuf.length() > 12000) {
            session.inspectBuf.delete(0, session.inspectBuf.length() - 6000);
        }
        String text = session.inspectBuf.toString();

        if (outbound) {
            Matcher tm = TOKEN_PATTERN.matcher(text);
            if (tm.find()) {
                String tok = tm.group(1);
                if (!tok.equals(lastToken)) {
                    lastToken = tok;
                    if (listener != null) {
                        listener.onTokenCaptured(tok, session.dstIpStr, session.dstPort);
                    }
                }
            }
        } else {
            Matcher pm = PLAYER_ID_PATTERN.matcher(text);
            Matcher nm = NICK_PATTERN.matcher(text);
            String foundUid = pm.find() ? pm.group(1) : "";
            String foundNick = nm.find() ? decodeUnicodeEscapes(nm.group(1)) : "";
            if ((!foundUid.isEmpty() && !foundUid.equals(lastUid))
                    || (!foundNick.isEmpty() && !foundNick.equals(lastNick))) {
                if (!foundUid.isEmpty()) lastUid = foundUid;
                if (!foundNick.isEmpty()) lastNick = foundNick;
                if (listener != null) {
                    listener.onPlayerInfoCaptured(lastUid, lastNick);
                }
            }
        }
    }

    private static String decodeUnicodeEscapes(String s) {
        if (s == null || !s.contains("\\u")) return s;
        Matcher m = Pattern.compile("\\\\u([0-9a-fA-F]{4})").matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            char c = (char) Integer.parseInt(m.group(1), 16);
            m.appendReplacement(sb, Matcher.quoteReplacement(String.valueOf(c)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private void sendTcpPacketToTun(TcpSession s, int flags, byte[] payload, boolean includeMss) {
        int payloadLen = payload != null ? payload.length : 0;
        int tcpHeaderLen = includeMss ? 24 : 20;
        int totalLen = 20 + tcpHeaderLen + payloadLen;
        byte[] pkt = new byte[totalLen];

        // IPv4 Header (20 bytes)
        pkt[0] = 0x45;
        pkt[1] = 0x00;
        put16(pkt, 2, totalLen);
        put16(pkt, 4, s.ipId++);
        put16(pkt, 6, 0x4000); // Don't fragment
        pkt[8] = 64;
        pkt[9] = PROTO_TCP;
        System.arraycopy(s.dstIp, 0, pkt, 12, 4);
        System.arraycopy(s.srcIp, 0, pkt, 16, 4);
        put16(pkt, 10, calcChecksum(pkt, 0, 20));

        // TCP Header
        int t = 20;
        put16(pkt, t, s.dstPort);
        put16(pkt, t + 2, s.srcPort);
        put32(pkt, t + 4, s.serverSeq);
        put32(pkt, t + 8, s.clientSeq);
        pkt[t + 12] = (byte) ((tcpHeaderLen / 4) << 4);
        pkt[t + 13] = (byte) flags;
        put16(pkt, t + 14, 65535);
        if (includeMss) {
            pkt[t + 20] = 0x02;
            pkt[t + 21] = 0x04;
            put16(pkt, t + 22, 1360);
        }
        if (payloadLen > 0) {
            System.arraycopy(payload, 0, pkt, 20 + tcpHeaderLen, payloadLen);
        }

        int tcpCsum = calcTransportChecksum(s.dstIp, s.srcIp, PROTO_TCP, pkt, 20, tcpHeaderLen + payloadLen);
        put16(pkt, t + 16, tcpCsum);

        writeTun(pkt);
    }

    private void sendRawRst(byte[] srcIp, int srcPort, byte[] dstIp, int dstPort, long seq, long ack) {
        int totalLen = 40;
        byte[] pkt = new byte[totalLen];
        pkt[0] = 0x45;
        put16(pkt, 2, totalLen);
        pkt[8] = 64;
        pkt[9] = PROTO_TCP;
        System.arraycopy(srcIp, 0, pkt, 12, 4);
        System.arraycopy(dstIp, 0, pkt, 16, 4);
        put16(pkt, 10, calcChecksum(pkt, 0, 20));

        put16(pkt, 20, srcPort);
        put16(pkt, 22, dstPort);
        put32(pkt, 24, seq);
        put32(pkt, 28, ack);
        pkt[32] = 0x50;
        pkt[33] = (byte) (FLAG_RST | FLAG_ACK);
        put16(pkt, 36, calcTransportChecksum(srcIp, dstIp, PROTO_TCP, pkt, 20, 20));
        writeTun(pkt);
    }

    private void sendUdpPacketToTun(byte[] srcIp, int srcPort, byte[] dstIp, int dstPort, byte[] payload) {
        int udpLen = 8 + payload.length;
        int totalLen = 20 + udpLen;
        byte[] pkt = new byte[totalLen];
        pkt[0] = 0x45;
        put16(pkt, 2, totalLen);
        pkt[8] = 64;
        pkt[9] = PROTO_UDP;
        System.arraycopy(srcIp, 0, pkt, 12, 4);
        System.arraycopy(dstIp, 0, pkt, 16, 4);
        put16(pkt, 10, calcChecksum(pkt, 0, 20));

        put16(pkt, 20, srcPort);
        put16(pkt, 22, dstPort);
        put16(pkt, 24, udpLen);
        System.arraycopy(payload, 0, pkt, 28, payload.length);
        int csum = calcTransportChecksum(srcIp, dstIp, PROTO_UDP, pkt, 20, udpLen);
        put16(pkt, 26, csum == 0 ? 0xFFFF : csum);
        writeTun(pkt);
    }

    private void writeTun(byte[] pkt) {
        try {
            if (tunOut != null && running) {
                tunOut.write(pkt);
            }
        } catch (Exception ignored) {}
    }

    private void closeTcpSession(TcpSession s) {
        tcpSessions.remove(s.key);
        try { if (s.selKey != null) s.selKey.cancel(); } catch (Exception ignored) {}
        try { s.channel.close(); } catch (Exception ignored) {}
    }

    private void closeUdpSession(UdpSession s) {
        udpSessions.remove(s.key);
        try { if (s.selKey != null) s.selKey.cancel(); } catch (Exception ignored) {}
        try { s.channel.close(); } catch (Exception ignored) {}
    }

    private void cleanupIdleSessions(long now) {
        for (TcpSession s : tcpSessions.values()) {
            if (now - s.lastActiveMs > 180_000) closeTcpSession(s);
        }
        for (UdpSession s : udpSessions.values()) {
            if (now - s.lastActiveMs > 30_000) closeUdpSession(s);
        }
    }

    private static int u16(byte[] b, int off) {
        return ((b[off] & 0xFF) << 8) | (b[off + 1] & 0xFF);
    }

    private static long u32(byte[] b, int off) {
        return ((long) (b[off] & 0xFF) << 24)
                | ((long) (b[off + 1] & 0xFF) << 16)
                | ((long) (b[off + 2] & 0xFF) << 8)
                | ((long) (b[off + 3] & 0xFF));
    }

    private static void put16(byte[] b, int off, int val) {
        b[off] = (byte) ((val >>> 8) & 0xFF);
        b[off + 1] = (byte) (val & 0xFF);
    }

    private static void put32(byte[] b, int off, long val) {
        b[off] = (byte) ((val >>> 24) & 0xFF);
        b[off + 1] = (byte) ((val >>> 16) & 0xFF);
        b[off + 2] = (byte) ((val >>> 8) & 0xFF);
        b[off + 3] = (byte) (val & 0xFF);
    }

    private static String ipToStr(byte[] ip) {
        return (ip[0] & 0xFF) + "." + (ip[1] & 0xFF) + "." + (ip[2] & 0xFF) + "." + (ip[3] & 0xFF);
    }

    private static int calcChecksum(byte[] buf, int off, int len) {
        long sum = 0;
        for (int i = 0; i < len; i += 2) {
            int word = (buf[off + i] & 0xFF) << 8;
            if (i + 1 < len) word |= (buf[off + i + 1] & 0xFF);
            sum += word;
        }
        while ((sum >>> 16) != 0) {
            sum = (sum & 0xFFFF) + (sum >>> 16);
        }
        return (int) (~sum & 0xFFFF);
    }

    private static int calcTransportChecksum(byte[] srcIp, byte[] dstIp, int proto, byte[] buf, int off, int len) {
        long sum = 0;
        sum += ((srcIp[0] & 0xFF) << 8) | (srcIp[1] & 0xFF);
        sum += ((srcIp[2] & 0xFF) << 8) | (srcIp[3] & 0xFF);
        sum += ((dstIp[0] & 0xFF) << 8) | (dstIp[1] & 0xFF);
        sum += ((dstIp[2] & 0xFF) << 8) | (dstIp[3] & 0xFF);
        sum += proto;
        sum += len;

        for (int i = 0; i < len; i += 2) {
            int word = (buf[off + i] & 0xFF) << 8;
            if (i + 1 < len) word |= (buf[off + i + 1] & 0xFF);
            sum += word;
        }
        while ((sum >>> 16) != 0) {
            sum = (sum & 0xFFFF) + (sum >>> 16);
        }
        return (int) (~sum & 0xFFFF);
    }
}

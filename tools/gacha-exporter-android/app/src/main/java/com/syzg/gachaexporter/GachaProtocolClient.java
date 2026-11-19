package com.syzg.gachaexporter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 裸 TCP + Protobuf 协议直连全量拉取客户端（与 PC 工具同款 441/442 协议）。
 */
public final class GachaProtocolClient {

    public interface SocketProtector {
        void protect(Socket socket);
    }

    public interface LogCallback {
        void onLog(String msg);
    }

    public static final class GachaItem {
        public long id;
        public String typeId;
        public String poolId;
        public long crateAt;
        public long at;
    }

    public static final class ProtocolPacket {
        public String signature = "";
        public int routerType;
        public int serverPushType;
        public long messageSeqNum;
        public int code;
        public String desc = "";
        public long serverTime;
        public String bodyText = "";
    }

    public static final class PullResult {
        public List<GachaItem> items = new ArrayList<>();
        public int heroTotal;
        public int petTotal;
        public int skippedSilver;
        public long elapsedMs;
        public String uid = "";
        public String nickname = "";
        public String avatar = "";
    }

    public static boolean isSilverCoinRecord(String typeId, String poolId) {
        if (typeId == null || !typeId.startsWith("pet_")) return false;
        return "2".equals(poolId) || "4".equals(poolId);
    }

    private static final java.util.Map<String, String> AVATAR_ID_TO_ICON = new java.util.HashMap<>();
    static {
        AVATAR_ID_TO_ICON.put("hero_001", "at001_0");
        AVATAR_ID_TO_ICON.put("new_hero_002", "at002_1");
        AVATAR_ID_TO_ICON.put("hero_002_skin01", "at002a_1");
        AVATAR_ID_TO_ICON.put("hero_005_skin01", "at005a");
        AVATAR_ID_TO_ICON.put("hero_015_skin01", "at015a_0");
        AVATAR_ID_TO_ICON.put("hero_036_skin01", "at036a");
        AVATAR_ID_TO_ICON.put("hero_049_skin01", "at049a_0");
        AVATAR_ID_TO_ICON.put("hero_050_skin01", "at050a_0");
        AVATAR_ID_TO_ICON.put("hero_060_skin01", "at060_a");
    }

    public static String normalizeGameAvatar(String avatar, int sex) {
        if (avatar == null) return "";
        String av = avatar.trim();
        if (av.isEmpty()) return "";
        if (("at001".equals(av) || "at001_0".equals(av) || "hero_001".equals(av)) && sex == 1) return "at001b_0";
        if ("at001".equals(av) || "hero_001".equals(av)) return "at001_0";
        String mapped = AVATAR_ID_TO_ICON.get(av);
        if (mapped != null) return mapped;
        if (av.matches("^(?:new_)?hero_\\d{3}$")) {
            return "at" + av.substring(av.length() - 3) + "_0";
        }
        if (av.matches("^pet_\\d{3}$")) {
            return "avatar_" + av;
        }
        if (av.matches("^at\\d+$")) return av + "_0";
        return av;
    }

    private GachaProtocolClient() {}

    public static byte[] encodeFrame(int routerType, long seq, String bodyJson) {
        String sig = Ed25519Signer.sign(bodyJson);
        byte[] sigBytes = sig.getBytes(StandardCharsets.UTF_8);
        byte[] bodyBytes = bodyJson.getBytes(StandardCharsets.UTF_8);

        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        payload.write(0x0A);
        writeVarint(payload, sigBytes.length);
        payload.write(sigBytes, 0, sigBytes.length);

        payload.write(0x10);
        writeVarint(payload, routerType);

        payload.write(0x20);
        writeVarint(payload, seq);

        payload.write(0x42);
        writeVarint(payload, bodyBytes.length);
        payload.write(bodyBytes, 0, bodyBytes.length);

        byte[] pBytes = payload.toByteArray();
        ByteArrayOutputStream framed = new ByteArrayOutputStream();
        writeVarint(framed, pBytes.length);
        framed.write(pBytes, 0, pBytes.length);
        return framed.toByteArray();
    }

    private static void writeVarint(ByteArrayOutputStream out, long v) {
        long val = v;
        while ((val & ~0x7FL) != 0) {
            out.write((int) ((val & 0x7FL) | 0x80L));
            val >>>= 7;
        }
        out.write((int) val);
    }

    public static int[] tryDecodeVarint(byte[] buf, int offset, int len) {
        long val = 0;
        int shift = 0;
        int pos = offset;
        int end = offset + len;
        while (pos < end) {
            int b = buf[pos++] & 0xFF;
            val |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                return new int[]{(int) val, pos};
            }
            shift += 7;
            if (shift > 63) break;
        }
        return null;
    }

    public static ProtocolPacket parsePacket(byte[] buf, int offset, int len) {
        ProtocolPacket pkt = new ProtocolPacket();
        int pos = offset;
        int end = offset + len;
        while (pos < end) {
            int[] tagRes = tryDecodeVarint(buf, pos, end - pos);
            if (tagRes == null) break;
            int tag = tagRes[0];
            pos = tagRes[1];
            int field = tag >>> 3;
            int wire = tag & 7;

            if (wire == 0) {
                int[] valRes = tryDecodeVarint(buf, pos, end - pos);
                if (valRes == null) break;
                int v = valRes[0];
                pos = valRes[1];
                if (field == 2) pkt.routerType = v;
                else if (field == 3) pkt.serverPushType = v;
                else if (field == 4) pkt.messageSeqNum = v;
                else if (field == 5) pkt.code = v;
                else if (field == 7) pkt.serverTime = v;
            } else if (wire == 2) {
                int[] lenRes = tryDecodeVarint(buf, pos, end - pos);
                if (lenRes == null) break;
                int slen = lenRes[0];
                pos = lenRes[1];
                if (pos + slen > end) break;
                String str = new String(buf, pos, slen, StandardCharsets.UTF_8);
                if (field == 1) pkt.signature = str;
                else if (field == 6) pkt.desc = str;
                else if (field == 8) pkt.bodyText = str;
                pos += slen;
            } else {
                break;
            }
        }
        return pkt;
    }

    public static PullResult pullAll(
            String host,
            int port,
            String token,
            String uidHint,
            String nickHint,
            String avatarHint,
            SocketProtector protector,
            LogCallback logCb
    ) throws Exception {
        long t0 = System.currentTimeMillis();
        PullResult res = new PullResult();
        res.uid = uidHint != null ? uidHint : "";
        res.nickname = nickHint != null ? nickHint : "";
        res.avatar = avatarHint != null ? avatarHint : "";

        try (Socket socket = new Socket()) {
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(8000);
            if (protector != null) {
                protector.protect(socket);
            }
            socket.connect(new InetSocketAddress(host, port), 8000);

            OutputStream out = socket.getOutputStream();
            InputStream in = socket.getInputStream();
            ByteArrayOutputStream recvBuf = new ByteArrayOutputStream();
            long seq = 90000;

            // 若已有 UID 且昵称或头像为空，优先走 489 (queryFriendDisplayInfo) / 兜底 28 查询真实用户名与头像 ID
            if (!res.uid.isEmpty() && (res.nickname.isEmpty() || res.avatar.isEmpty())) {
                try {
                    long uidNum = Long.parseLong(res.uid);
                    JSONObject dispReq = new JSONObject();
                    dispReq.put("token", token);
                    dispReq.put("playerId", uidNum);
                    ProtocolPacket uResp = sendAndAwait(out, in, recvBuf, 489, ++seq, dispReq.toString());
                    if (uResp != null && uResp.code == 0 && !uResp.bodyText.isEmpty()) {
                        JSONObject pObj = new JSONObject(uResp.bodyText);
                        String n = pObj.optString("nickName", "");
                        if (!n.isEmpty() && res.nickname.isEmpty()) res.nickname = n;
                        String av = normalizeGameAvatar(pObj.optString("avatar", ""), pObj.optInt("sex", 0));
                        if (!av.isEmpty() && res.avatar.isEmpty()) res.avatar = av;
                    }
                    if (res.nickname.isEmpty() || res.avatar.isEmpty()) {
                        JSONObject qObj = new JSONObject();
                        qObj.put("token", token);
                        qObj.put("playerId", uidNum);
                        qObj.put("nickName", "");
                        uResp = sendAndAwait(out, in, recvBuf, 28, ++seq, qObj.toString());
                        if (uResp != null && uResp.code == 0 && !uResp.bodyText.isEmpty()) {
                            JSONArray datas = new JSONObject(uResp.bodyText).optJSONArray("datas");
                            if (datas != null && datas.length() > 0) {
                                JSONObject row0 = datas.getJSONObject(0);
                                String n = row0.optString("nickName", "");
                                if (!n.isEmpty() && res.nickname.isEmpty()) res.nickname = n;
                                String av = normalizeGameAvatar(row0.optString("avatar", ""), row0.optInt("sex", 0));
                                if (!av.isEmpty() && res.avatar.isEmpty()) res.avatar = av;
                            }
                        }
                    }
                    if ((!res.nickname.isEmpty() || !res.avatar.isEmpty()) && logCb != null) {
                        String avPart = res.avatar.isEmpty() ? "" : ", 头像: " + res.avatar;
                        logCb.onLog("[✓] 获取玩家信息: " + (res.nickname.isEmpty() ? "小小工匠" : res.nickname)
                                + " (UID: " + res.uid + avPart + ")");
                    }
                } catch (Exception ignored) {}
            }

            String[] queryTypes = new String[]{"hero", "gacha"};
            for (String qType : queryTypes) {
                JSONObject pReq = new JSONObject();
                pReq.put("token", token);
                pReq.put("queryType", qType);
                ProtocolPacket pResp = sendAndAwait(out, in, recvBuf, 441, ++seq, pReq.toString());
                if (pResp == null || pResp.code != 0) {
                    throw new IllegalStateException("查询 " + qType + " 参数失败: Code=" + (pResp != null ? pResp.code : -1));
                }

                JSONObject pJson = new JSONObject(pResp.bodyText);
                int totalRows = pJson.optInt("totalRows", 0);
                long maxId = pJson.optLong("maxId", 0) + 1;
                if ("hero".equals(qType)) res.heroTotal = totalRows;
                else res.petTotal = totalRows;

                int fetched = 0;
                int skippedTypeSilver = 0;
                int pages = 0;
                while (totalRows > 0 && fetched < totalRows && pages < 200) {
                    pages++;
                    JSONObject dReq = new JSONObject();
                    dReq.put("token", token);
                    dReq.put("queryType", qType);
                    dReq.put("maxId", maxId);
                    dReq.put("pageSize", 100);

                    ProtocolPacket dResp = sendAndAwait(out, in, recvBuf, 442, ++seq, dReq.toString());
                    if (dResp == null || dResp.code != 0) {
                        throw new IllegalStateException("拉取 " + qType + " 第 " + pages + " 页失败: Code=" + (dResp != null ? dResp.code : -1));
                    }

                    JSONObject dJson = new JSONObject(dResp.bodyText);
                    JSONArray arr = dJson.optJSONArray("datas");
                    if (arr == null || arr.length() == 0) break;

                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject row = arr.getJSONObject(i);
                        GachaItem item = new GachaItem();
                        item.id = row.getLong("id");
                        item.typeId = row.getString("typeId");
                        item.poolId = String.valueOf(row.get("poolId"));
                        item.crateAt = row.getLong("crateAt");
                        item.at = item.crateAt > 100000000000L ? item.crateAt : item.crateAt * 1000L;
                        if (isSilverCoinRecord(item.typeId, item.poolId)) {
                            res.skippedSilver++;
                            skippedTypeSilver++;
                        } else {
                            res.items.add(item);
                        }
                        maxId = item.id;
                    }
                    fetched += arr.length();
                }
                if (logCb != null) {
                    String extra = skippedTypeSilver > 0 ? String.format(Locale.CHINA, "，已剔除 %d 条银币池记录", skippedTypeSilver) : "";
                    logCb.onLog(String.format(Locale.CHINA, "[✓] %s 全量抓取完成: %d/%d 条 (%d 页%s)",
                            "hero".equals(qType) ? "伙伴招募" : "魔物贩售", fetched, totalRows, pages, extra));
                }
            }
        }

        res.elapsedMs = System.currentTimeMillis() - t0;
        return res;
    }

    private static ProtocolPacket sendAndAwait(
            OutputStream out,
            InputStream in,
            ByteArrayOutputStream recvBuf,
            int routerType,
            long seq,
            String bodyJson
    ) throws Exception {
        byte[] frame = encodeFrame(routerType, seq, bodyJson);
        out.write(frame);
        out.flush();

        byte[] tmp = new byte[16384];
        long deadline = System.currentTimeMillis() + 8000;
        while (System.currentTimeMillis() < deadline) {
            byte[] cur = recvBuf.toByteArray();
            int consumed = 0;
            while (consumed < cur.length) {
                int[] lenRes = tryDecodeVarint(cur, consumed, cur.length - consumed);
                if (lenRes == null) break;
                int frameLen = lenRes[0];
                int bodyStart = lenRes[1];
                if (cur.length - bodyStart < frameLen) break;

                ProtocolPacket pkt = parsePacket(cur, bodyStart, frameLen);
                consumed = bodyStart + frameLen;
                if (pkt.messageSeqNum == seq) {
                    recvBuf.reset();
                    if (consumed < cur.length) {
                        recvBuf.write(cur, consumed, cur.length - consumed);
                    }
                    return pkt;
                }
            }
            if (consumed > 0) {
                recvBuf.reset();
                if (consumed < cur.length) {
                    recvBuf.write(cur, consumed, cur.length - consumed);
                }
            }

            int n = in.read(tmp);
            if (n <= 0) break;
            recvBuf.write(tmp, 0, n);
        }
        return null;
    }

    public static String buildExportJson(List<GachaItem> items, String uid, String nickname) {
        return buildExportJson(items, uid, nickname, "");
    }

    public static String buildExportJson(List<GachaItem> items, String uid, String nickname, String avatar) {
        List<GachaItem> sorted = new ArrayList<>(items);
        Collections.sort(sorted, Comparator.comparingLong(a -> a.id));

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));

        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append("  \"schemaVersion\": 1,\n");
        sb.append("  \"source\": \"android_vpn_direct\",\n");
        sb.append("  \"exportedAt\": \"").append(sdf.format(new Date())).append("\",\n");
        if ((uid != null && !uid.isEmpty())
                || (nickname != null && !nickname.isEmpty())
                || (avatar != null && !avatar.isEmpty())) {
            sb.append("  \"player\": {");
            boolean needComma = false;
            if (uid != null && !uid.isEmpty()) {
                sb.append(" \"uid\": \"").append(escapeJson(uid)).append("\"");
                needComma = true;
            }
            if (nickname != null && !nickname.isEmpty()) {
                if (needComma) sb.append(",");
                sb.append(" \"nickname\": \"").append(escapeJson(nickname)).append("\"");
                needComma = true;
            }
            if (avatar != null && !avatar.isEmpty()) {
                if (needComma) sb.append(",");
                sb.append(" \"avatar\": \"").append(escapeJson(avatar)).append("\"");
            }
            sb.append(" },\n");
        }
        sb.append("  \"records\": [\n");
        for (int i = 0; i < sorted.size(); i++) {
            GachaItem it = sorted.get(i);
            sb.append("    { \"id\": ").append(it.id)
              .append(", \"typeId\": \"").append(escapeJson(it.typeId)).append("\"")
              .append(", \"poolId\": \"").append(escapeJson(it.poolId)).append("\"")
              .append(", \"crateAt\": ").append(it.crateAt)
              .append(", \"at\": ").append(it.at).append(" }");
            if (i < sorted.size() - 1) sb.append(",\n");
            else sb.append("\n");
        }
        sb.append("  ]\n");
        sb.append("}\n");
        return sb.toString();
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

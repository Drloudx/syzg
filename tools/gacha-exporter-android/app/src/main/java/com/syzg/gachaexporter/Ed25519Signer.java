package com.syzg.gachaexporter;

import android.util.Base64;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * 纯 Java RFC 8032 Ed25519 签名工具（零外部依赖，密钥与游戏客户端 SignUtil.cs 一致）。
 */
public final class Ed25519Signer {

    private static final String PRIVATE_KEY_B64 = "ktR6U4w71ycpUzTZyIfLNRbUQ277zAfptvMyRarqqTI=";

    private static final BigInteger P = new BigInteger("57896044618658097711785492504343953926634992332820282019728792003956564819949");
    private static final BigInteger L = new BigInteger("7237005577332262213973186563042994240857116359379907606001950938285454250989");
    private static final BigInteger D = new BigInteger("-121665")
            .multiply(new BigInteger("121666").modInverse(P))
            .mod(P);
    private static final BigInteger BX = new BigInteger("15112221349535400772501151409588531511454012693041857206046113283949847762202");
    private static final BigInteger BY = new BigInteger("46316835694926478169428394003475163141307993866256225615783033603165251855960");

    private static final byte[] PREFIX;
    private static final BigInteger SCALAR_A;
    private static final byte[] PUBLIC_KEY_BYTES;

    private static final class ExtPoint {
        final BigInteger x, y, z, t;
        ExtPoint(BigInteger x, BigInteger y, BigInteger z, BigInteger t) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.t = t;
        }
    }

    static {
        try {
            byte[] seed = decodeBase64(PRIVATE_KEY_B64);
            MessageDigest sha = MessageDigest.getInstance("SHA-512");
            byte[] h = sha.digest(seed);
            h[0] &= (byte) 248;
            h[31] &= (byte) 127;
            h[31] |= (byte) 64;

            SCALAR_A = fromLittleEndianUnsigned(Arrays.copyOfRange(h, 0, 32));
            PREFIX = Arrays.copyOfRange(h, 32, 64);

            ExtPoint pubPt = scalarMult(toExtended(BX, BY), SCALAR_A);
            PUBLIC_KEY_BYTES = encodePoint(pubPt);
        } catch (Exception e) {
            throw new RuntimeException("Ed25519 init failed", e);
        }
    }

    private Ed25519Signer() {}

    public static String sign(String message) {
        try {
            byte[] msgBytes = message.getBytes(StandardCharsets.UTF_8);
            MessageDigest sha = MessageDigest.getInstance("SHA-512");
            sha.update(PREFIX);
            sha.update(msgBytes);
            BigInteger r = fromLittleEndianUnsigned(sha.digest()).mod(L);

            ExtPoint rPt = scalarMult(toExtended(BX, BY), r);
            byte[] rEncoded = encodePoint(rPt);

            sha.reset();
            sha.update(rEncoded);
            sha.update(PUBLIC_KEY_BYTES);
            sha.update(msgBytes);
            BigInteger k = fromLittleEndianUnsigned(sha.digest()).mod(L);

            BigInteger s = r.add(k.multiply(SCALAR_A)).mod(L);
            byte[] sEncoded = toLittleEndian32(s);

            byte[] sig = new byte[64];
            System.arraycopy(rEncoded, 0, sig, 0, 32);
            System.arraycopy(sEncoded, 0, sig, 32, 32);
            return encodeBase64(sig);
        } catch (Exception e) {
            throw new RuntimeException("Ed25519 sign failed", e);
        }
    }

    private static byte[] decodeBase64(String b64) {
        try {
            return java.util.Base64.getDecoder().decode(b64);
        } catch (Throwable ignored) {
            return Base64.decode(b64, Base64.DEFAULT);
        }
    }

    private static String encodeBase64(byte[] data) {
        try {
            return java.util.Base64.getEncoder().encodeToString(data);
        } catch (Throwable ignored) {
            return Base64.encodeToString(data, Base64.NO_WRAP);
        }
    }

    private static BigInteger fromLittleEndianUnsigned(byte[] le) {
        byte[] be = new byte[le.length];
        for (int i = 0; i < le.length; i++) {
            be[i] = le[le.length - 1 - i];
        }
        return new BigInteger(1, be);
    }

    private static byte[] toLittleEndian32(BigInteger v) {
        byte[] be = v.toByteArray();
        byte[] out = new byte[32];
        int len = Math.min(32, be.length);
        for (int i = 0; i < len; i++) {
            out[i] = be[be.length - 1 - i];
        }
        return out;
    }

    private static ExtPoint toExtended(BigInteger x, BigInteger y) {
        return new ExtPoint(x, y, BigInteger.ONE, x.multiply(y).mod(P));
    }

    private static ExtPoint pointAdd(ExtPoint p1, ExtPoint p2) {
        BigInteger a = p1.y.subtract(p1.x).multiply(p2.y.subtract(p2.x)).mod(P);
        BigInteger b = p1.y.add(p1.x).multiply(p2.y.add(p2.x)).mod(P);
        BigInteger c = p1.t.multiply(BigInteger.valueOf(2)).multiply(D).multiply(p2.t).mod(P);
        BigInteger d = p1.z.multiply(BigInteger.valueOf(2)).multiply(p2.z).mod(P);
        BigInteger e = b.subtract(a).mod(P);
        BigInteger f = d.subtract(c).mod(P);
        BigInteger g = d.add(c).mod(P);
        BigInteger h = b.add(a).mod(P);
        return new ExtPoint(
                e.multiply(f).mod(P),
                g.multiply(h).mod(P),
                f.multiply(g).mod(P),
                e.multiply(h).mod(P)
        );
    }

    private static ExtPoint scalarMult(ExtPoint pt, BigInteger scalar) {
        ExtPoint result = new ExtPoint(BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO);
        ExtPoint current = pt;
        BigInteger k = scalar;
        while (k.signum() > 0) {
            if (k.testBit(0)) {
                result = pointAdd(result, current);
            }
            current = pointAdd(current, current);
            k = k.shiftRight(1);
        }
        return result;
    }

    private static byte[] encodePoint(ExtPoint pt) {
        BigInteger zInv = pt.z.modInverse(P);
        BigInteger x = pt.x.multiply(zInv).mod(P);
        BigInteger y = pt.y.multiply(zInv).mod(P);
        byte[] encoded = toLittleEndian32(y);
        if (x.testBit(0)) {
            encoded[31] |= (byte) 0x80;
        }
        return encoded;
    }
}

package com.syzg.gachaexporter;

import org.junit.Test;
import static org.junit.Assert.*;

public class ProtocolTest {

    @Test
    public void ed25519MatchesReferenceSignature() {
        String sig = Ed25519Signer.sign("{\"token\":\"abc\",\"queryType\":\"hero\"}");
        assertEquals(
                "3M/Uz1sF8sElUbx0qhCn6cgfovDvPY3tMWJgsMYp43mqh2cwjgnyyDl92WShOXeERjnj5ovlPX1INZO8SoAhAA==",
                sig
        );
    }

    @Test
    public void protoWireRoundTrip() {
        byte[] framed = GachaProtocolClient.encodeFrame(441, 7L, "{\"token\":\"abc\",\"queryType\":\"hero\"}");
        int[] lenRes = GachaProtocolClient.tryDecodeVarint(framed, 0, framed.length);
        assertNotNull(lenRes);
        GachaProtocolClient.ProtocolPacket pkt = GachaProtocolClient.parsePacket(framed, lenRes[1], lenRes[0]);
        assertEquals(441, pkt.routerType);
        assertEquals(7L, pkt.messageSeqNum);
        assertEquals("{\"token\":\"abc\",\"queryType\":\"hero\"}", pkt.bodyText);
        assertEquals(Ed25519Signer.sign("{\"token\":\"abc\",\"queryType\":\"hero\"}"), pkt.signature);
    }

    @Test
    public void filtersSilverCoinPoolsAndIncludesPlayerAvatar() {
        assertTrue(GachaProtocolClient.isSilverCoinRecord("pet_045", "2"));
        assertTrue(GachaProtocolClient.isSilverCoinRecord("pet_045", "4"));
        assertFalse(GachaProtocolClient.isSilverCoinRecord("pet_106", "1"));
        assertFalse(GachaProtocolClient.isSilverCoinRecord("pet_106", "3"));
        assertFalse(GachaProtocolClient.isSilverCoinRecord("hero_001", "2"));

        assertEquals("at001_0", GachaProtocolClient.normalizeGameAvatar("at001", 0));
        assertEquals("at001b_0", GachaProtocolClient.normalizeGameAvatar("at001", 1));
        assertEquals("at001b_0", GachaProtocolClient.normalizeGameAvatar("hero_001", 1));
        assertEquals("at002a_1", GachaProtocolClient.normalizeGameAvatar("hero_002_skin01", 0));
        assertEquals("at002_1", GachaProtocolClient.normalizeGameAvatar("new_hero_002", 0));
        assertEquals("at060_0", GachaProtocolClient.normalizeGameAvatar("hero_060", 0));
        assertEquals("at060_0", GachaProtocolClient.normalizeGameAvatar("at060", 0));
        assertEquals("avatar_pet_106", GachaProtocolClient.normalizeGameAvatar("avatar_pet_106", 0));

        String json = GachaProtocolClient.buildExportJson(
                java.util.Collections.emptyList(), "100042", "测试工匠", "at060_0");
        assertTrue(json.contains("\"avatar\": \"at060_0\""));
        assertTrue(json.contains("\"nickname\": \"测试工匠\""));
    }
}

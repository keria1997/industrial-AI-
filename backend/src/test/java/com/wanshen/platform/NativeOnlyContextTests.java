package com.wanshen.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "JAVA_NATIVE_ONLY=true",
        "server.port=0"
})
@AutoConfigureMockMvc
class NativeOnlyContextTests {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void startsAllNativeModulesWithoutCatchAllProxy() throws Exception {
        mockMvc.perform(get("/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runtime").value("java"));
        mockMvc.perform(get("/api/v1/production/readiness"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/not-covered-by-java"))
                .andExpect(status().isNotFound());
    }
}

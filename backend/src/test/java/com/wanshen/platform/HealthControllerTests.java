package com.wanshen.platform;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HealthControllerTests {
    private HealthController controller() {
        return new HealthController(new org.springframework.beans.factory.support.DefaultListableBeanFactory()
                .getBeanProvider(javax.sql.DataSource.class), new org.springframework.mock.env.MockEnvironment(), new WorkerHealth());
    }
    @Test
    void reportsJavaRuntimeHealth() throws Exception {
        MockMvcBuilders.standaloneSetup(controller()).build()
                .perform(get("/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.runtime").value("java"));
    }

    @Test void readinessRejectsMissingDatabaseWhileLivenessRemainsAvailable() throws Exception {
        MockMvcBuilders.standaloneSetup(controller()).build().perform(get("/readyz"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("not_ready"));
    }
}

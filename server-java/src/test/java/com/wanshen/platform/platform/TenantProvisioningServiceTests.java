package com.wanshen.platform.platform;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantProvisioningServiceTests {
    @Test
    void provisionsTenantBaselineOnce() {
        TenantProvisioningService service = new TenantProvisioningService(new InMemoryPlatformProvisioningStore());
        var input = new TenantProvisioningService.Input("TENANT-NEW", "新企业", "tenant-admin", "管理员");

        assertTrue(service.provisionBaseline(input).created());
        assertFalse(service.provisionBaseline(input).created());
    }
}

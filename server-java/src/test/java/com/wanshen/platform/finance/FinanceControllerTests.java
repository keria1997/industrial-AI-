package com.wanshen.platform.finance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.finance.AbstractFinanceStore.Receivable;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FinanceControllerTests {
    private MockMvc mockMvc;
    private String token;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        TokenService tokenService = new TokenService("test-secret", new ObjectMapper());
        RequestContextService contexts = new RequestContextService(tokenService);
        FinanceStore store = new FinanceStore();
        store.saveReceivable(new Receivable("ar-1", "TENANT-SHWS", "AR-1", "客户", "c-1", "客户一",
                "AR", "order", "o-1", "SO-1", "CNY", "100", "0", "100", "pending",
                "2099-01-01", Instant.now().toString(), null, "", 1, Instant.now().toString(),
                Instant.now().toString(), "admin"));
        mockMvc = MockMvcBuilders.standaloneSetup(new FinanceController(store, contexts, objectMapper))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue("admin", "系统管理员", "超级管理员", List.of("TENANT-SHWS"),
                List.of("*"), "development-session-v1").accessToken();
    }

    @Test
    void settlesReceivableIntoPaymentInvoiceAndVoucher() throws Exception {
        mockMvc.perform(post("/api/v1/finance/receivables/ar-1/settlement")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "settle-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paymentMethod\":\"bank_transfer\",\"paymentDate\":\"2099-01-01\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.document.status").value("done"))
                .andExpect(jsonPath("$.document.outstandingAmount").value("0"))
                .andExpect(jsonPath("$.payment.status").value("done"))
                .andExpect(jsonPath("$.invoice.status").value("done"))
                .andExpect(jsonPath("$.voucher.status").value("posted"));
    }

    @Test
    void rejectsUnbalancedVoucher() throws Exception {
        mockMvc.perform(post("/api/v1/finance/vouchers")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "voucher-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"voucherType":"general","summary":"不平衡","lines":[
                                 {"accountCode":"1002","accountName":"银行","debitAmount":"10","creditAmount":"0"},
                                 {"accountCode":"1122","accountName":"应收","debitAmount":"0","creditAmount":"9"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_400_INVALID_ARGUMENT"));
    }

    @Test
    void rejectsPaymentOverOutstandingBalance() throws Exception {
        mockMvc.perform(post("/api/v1/finance/payments")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "payment-over")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"direction":"INBOUND","receivableId":"ar-1","counterpartyId":"c-1",
                                 "counterpartyName":"客户一","amount":"100.000001","paymentMethod":"cash",
                                 "paymentDate":"2099-01-01"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.message").value("收款金额超过未收余额"));
    }

    @Test
    void replaysSettlementWithSameIdempotencyKey() throws Exception {
        String body = "{\"paymentMethod\":\"cash\",\"paymentDate\":\"2099-01-01\"}";
        for (int index = 0; index < 2; index++) {
            MvcResult result = mockMvc.perform(post("/api/v1/finance/receivables/ar-1/settlement")
                            .header("Authorization", "Bearer " + token)
                            .header("X-Tenant-Id", "TENANT-SHWS")
                            .header("X-Idempotency-Key", "settle-replay")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isCreated()).andReturn();
            JsonNode bodyJson = objectMapper.readTree(result.getResponse().getContentAsString());
            org.junit.jupiter.api.Assertions.assertEquals("ar-1", bodyJson.path("document").path("id").asText());
        }
    }
}

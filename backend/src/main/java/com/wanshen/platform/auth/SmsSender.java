package com.wanshen.platform.auth;

public interface SmsSender {
    Delivery send(String phone, String code);

    record Delivery(String requestId, boolean development) {}
}

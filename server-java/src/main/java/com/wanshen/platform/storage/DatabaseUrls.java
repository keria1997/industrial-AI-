package com.wanshen.platform.storage;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class DatabaseUrls {
    private DatabaseUrls() {}

    public static String jdbc(String databaseUrl) {
        if (databaseUrl == null || databaseUrl.isBlank()) return "";
        String value = databaseUrl.trim();
        if (value.startsWith("jdbc:postgresql://")) return value;
        if (value.startsWith("postgresql://") || value.startsWith("postgres://")) {
            return toJdbcUrl(URI.create(value));
        }
        throw new IllegalArgumentException(
                "DATABASE_URL must be a PostgreSQL or JDBC PostgreSQL URL: " + value);
    }

    private static String toJdbcUrl(URI uri) {
        if (uri.getHost() == null || (uri.getPath() == null || uri.getPath().length() < 2)) {
            throw new IllegalArgumentException("PostgreSQL URL requires host and database: " + uri);
        }

        List<String> parameters = new ArrayList<>();
        if (uri.getRawQuery() != null && !uri.getRawQuery().isBlank()) {
            Arrays.stream(uri.getRawQuery().split("&"))
                    .filter(item -> !item.isBlank())
                    .filter(item -> !item.toLowerCase().startsWith("user=")
                            && !item.toLowerCase().startsWith("password="))
                    .forEach(parameters::add);
        }
        if (uri.getUserInfo() != null) {
            int passwordAt = uri.getUserInfo().indexOf(':');
            String user = passwordAt < 0 ? uri.getUserInfo() : uri.getUserInfo().substring(0, passwordAt);
            String password = passwordAt < 0 ? null : uri.getUserInfo().substring(passwordAt + 1);
            parameters.add("user=" + encode(URLDecoder.decode(user, StandardCharsets.UTF_8)));
            if (password != null) {
                parameters.add("password=" + encode(URLDecoder.decode(password, StandardCharsets.UTF_8)));
            }
        }

        String port = uri.getPort() < 0 ? "5432" : Integer.toString(uri.getPort());
        String query = parameters.isEmpty() ? "" : "?" + String.join("&", parameters);
        return "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + query;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}

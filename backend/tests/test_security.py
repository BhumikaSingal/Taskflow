from app import create_app


def test_health_and_security_headers():
    client = create_app().test_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_csrf_endpoint_returns_token_and_cookie():
    client = create_app().test_client()
    response = client.get("/api/csrf")
    assert response.status_code == 200
    assert response.json["csrf_token"]
    assert "taskflow_csrf=" in response.headers["Set-Cookie"]


def test_mutating_api_requires_csrf():
    client = create_app().test_client()
    response = client.post("/auth/logout")
    assert response.status_code == 200

    response = client.post("/api/notifications/read-all")
    assert response.status_code == 403
    assert response.json["error"] == "Invalid CSRF token"

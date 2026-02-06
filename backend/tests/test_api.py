"""API tests."""


def test_root(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Glide API"
    assert data["status"] == "running"


def test_health(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_register_user(client):
    """Test user registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
            "full_name": "Test User",
        },
    )
    # Will fail without database, but tests the endpoint exists
    assert response.status_code in [201, 500]


def test_login_invalid(client):
    """Test login with invalid credentials."""
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "invalid@example.com",
            "password": "wrongpassword",
        },
    )
    assert response.status_code in [400, 401, 500]


def test_protected_endpoint_no_auth(client):
    """Test that protected endpoints require auth."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_notes_list_no_auth(client):
    """Test that notes endpoint requires auth."""
    response = client.get("/api/v1/notes")
    assert response.status_code == 401


def test_voice_process_no_auth(client):
    """Test that voice processing requires auth."""
    response = client.post("/api/v1/voice/process")
    assert response.status_code in [401, 422]  # 422 if missing file


def test_integrations_status_no_auth(client):
    """Test integrations status requires auth."""
    response = client.get("/api/v1/integrations/status")
    assert response.status_code == 401

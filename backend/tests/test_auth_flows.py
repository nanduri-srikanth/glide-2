"""Auth flow tests."""


def test_register_login_me_flow(client):
    email = "auth-flow@example.com"
    password = "testpassword123"

    register = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "QA User"},
    )
    assert register.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert login.status_code == 200
    token = login.json().get("access_token")
    assert token

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_register_duplicate_email(client):
    email = "auth-dup@example.com"
    password = "testpassword123"

    first = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert second.status_code == 409


def test_login_invalid_password(client):
    email = "auth-invalid@example.com"
    password = "testpassword123"

    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )

    login = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "wrongpassword"},
    )
    assert login.status_code in [400, 401, 403]

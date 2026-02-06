"""Idempotent create tests for client-generated IDs."""
from uuid import uuid4


def register_and_login(client, email: str, password: str = "testpassword123") -> dict:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": email,
            "password": password,
        },
    )

    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


def test_create_note_with_client_id_is_idempotent(client):
    headers = register_and_login(client, "note-idempotent@example.com")
    client_id = str(uuid4())

    payload = {
        "title": "Offline Note",
        "transcript": "First version",
        "tags": ["offline"],
        "client_id": client_id,
    }

    first = client.post("/api/v1/notes", json=payload, headers=headers)
    assert first.status_code == 201
    first_data = first.json()
    assert str(first_data["id"]) == client_id
    assert first_data["title"] == "Offline Note"
    assert first_data["transcript"] == "First version"

    second = client.post(
        "/api/v1/notes",
        json={
            **payload,
            "title": "Should Not Overwrite",
            "transcript": "Different",
        },
        headers=headers,
    )
    assert second.status_code == 201
    second_data = second.json()
    assert str(second_data["id"]) == client_id
    assert second_data["title"] == "Offline Note"
    assert second_data["transcript"] == "First version"


def test_note_update_delete_with_client_id(client):
    headers = register_and_login(client, "note-update-delete@example.com")
    client_id = str(uuid4())

    create = client.post(
        "/api/v1/notes",
        json={
            "title": "To Update",
            "transcript": "Original",
            "client_id": client_id,
        },
        headers=headers,
    )
    assert create.status_code == 201

    update = client.patch(
        f"/api/v1/notes/{client_id}",
        json={"title": "Updated", "transcript": "Changed"},
        headers=headers,
    )
    assert update.status_code == 200
    updated = update.json()
    assert str(updated["id"]) == client_id
    assert updated["title"] == "Updated"
    assert updated["transcript"] == "Changed"

    delete = client.delete(f"/api/v1/notes/{client_id}", headers=headers)
    assert delete.status_code == 204


def test_create_note_client_id_conflict_other_user(client):
    headers_user1 = register_and_login(client, "note-user1@example.com")
    headers_user2 = register_and_login(client, "note-user2@example.com")
    client_id = str(uuid4())

    first = client.post(
        "/api/v1/notes",
        json={
            "title": "User1 Note",
            "transcript": "Hello",
            "client_id": client_id,
        },
        headers=headers_user1,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/notes",
        json={
            "title": "User2 Note",
            "transcript": "World",
            "client_id": client_id,
        },
        headers=headers_user2,
    )
    assert second.status_code == 409


def test_create_folder_with_client_id_is_idempotent(client):
    headers = register_and_login(client, "folder-idempotent@example.com")
    client_id = str(uuid4())

    payload = {
        "name": "Offline Folder",
        "icon": "folder.fill",
        "color": "#FFAA00",
        "client_id": client_id,
    }

    first = client.post("/api/v1/folders", json=payload, headers=headers)
    assert first.status_code == 201
    first_data = first.json()
    assert str(first_data["id"]) == client_id
    assert first_data["name"] == "Offline Folder"

    second = client.post(
        "/api/v1/folders",
        json={
            **payload,
            "name": "Should Not Overwrite",
        },
        headers=headers,
    )
    assert second.status_code == 201
    second_data = second.json()
    assert str(second_data["id"]) == client_id
    assert second_data["name"] == "Offline Folder"


def test_folder_update_delete_with_client_id(client):
    headers = register_and_login(client, "folder-update-delete@example.com")
    client_id = str(uuid4())

    create = client.post(
        "/api/v1/folders",
        json={
            "name": "To Update",
            "icon": "folder.fill",
            "client_id": client_id,
        },
        headers=headers,
    )
    assert create.status_code == 201

    update = client.patch(
        f"/api/v1/folders/{client_id}",
        json={"name": "Updated"},
        headers=headers,
    )
    assert update.status_code == 200
    updated = update.json()
    assert str(updated["id"]) == client_id
    assert updated["name"] == "Updated"

    delete = client.delete(f"/api/v1/folders/{client_id}", headers=headers)
    assert delete.status_code == 204


def test_create_folder_client_id_conflict_other_user(client):
    headers_user1 = register_and_login(client, "folder-user1@example.com")
    headers_user2 = register_and_login(client, "folder-user2@example.com")
    client_id = str(uuid4())

    first = client.post(
        "/api/v1/folders",
        json={
            "name": "User1 Folder",
            "icon": "folder.fill",
            "client_id": client_id,
        },
        headers=headers_user1,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/folders",
        json={
            "name": "User2 Folder",
            "icon": "folder.fill",
            "client_id": client_id,
        },
        headers=headers_user2,
    )
    assert second.status_code == 409

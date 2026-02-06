"""Notes and folders API tests."""
from uuid import uuid4


def _register_and_login(client, email: str, password: str = "testpassword123") -> dict:
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


def test_notes_crud_flow(client):
    headers = _register_and_login(client, "notes-crud@example.com")

    # Create folder
    folder_resp = client.post(
        "/api/v1/folders",
        json={"name": "QA Folder", "icon": "folder.fill", "color": "#112233"},
        headers=headers,
    )
    assert folder_resp.status_code == 201
    folder_id = folder_resp.json()["id"]

    # Create note
    note_resp = client.post(
        "/api/v1/notes",
        json={
            "title": "QA Note",
            "transcript": "Initial content",
            "folder_id": folder_id,
            "tags": ["qa"],
        },
        headers=headers,
    )
    assert note_resp.status_code == 201
    note_id = note_resp.json()["id"]

    # List notes
    list_resp = client.get("/api/v1/notes", headers=headers)
    assert list_resp.status_code == 200
    assert any(item["id"] == note_id for item in list_resp.json()["items"])

    # Update note
    update_resp = client.patch(
        f"/api/v1/notes/{note_id}",
        json={"title": "QA Note Updated", "transcript": "Updated content"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "QA Note Updated"

    # Soft delete note
    delete_resp = client.delete(f"/api/v1/notes/{note_id}", headers=headers)
    assert delete_resp.status_code == 204

    # Restore note
    restore_resp = client.post(f"/api/v1/notes/{note_id}/restore", headers=headers)
    assert restore_resp.status_code == 200
    assert restore_resp.json()["id"] == note_id


def test_notes_all_endpoint(client):
    headers = _register_and_login(client, "notes-all@example.com")

    for idx in range(2):
        resp = client.post(
            "/api/v1/notes",
            json={
                "title": f"All Notes {idx}",
                "transcript": "Body",
            },
            headers=headers,
        )
        assert resp.status_code == 201

    all_resp = client.get("/api/v1/notes/all", headers=headers)
    assert all_resp.status_code == 200
    assert len(all_resp.json()["items"]) >= 2


def test_folders_crud_flow(client):
    headers = _register_and_login(client, "folders-crud@example.com")

    # Create folder
    folder_resp = client.post(
        "/api/v1/folders",
        json={"name": "Folder A", "icon": "folder.fill"},
        headers=headers,
    )
    assert folder_resp.status_code == 201
    folder_id = folder_resp.json()["id"]

    # List folders
    list_resp = client.get("/api/v1/folders", headers=headers)
    assert list_resp.status_code == 200
    assert any(item["id"] == folder_id for item in list_resp.json())

    # Update folder
    update_resp = client.patch(
        f"/api/v1/folders/{folder_id}",
        json={"name": "Folder A Updated"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Folder A Updated"

    # Reorder folders
    reorder_resp = client.post(
        "/api/v1/folders/reorder",
        json={"folders": [{"id": folder_id, "sort_order": 1, "parent_id": None}]},
        headers=headers,
    )
    assert reorder_resp.status_code == 200

    # Delete folder
    delete_resp = client.delete(f"/api/v1/folders/{folder_id}", headers=headers)
    assert delete_resp.status_code == 204


def test_folder_delete_moves_notes(client):
    headers = _register_and_login(client, "folders-move@example.com")

    folder_a = client.post(
        "/api/v1/folders",
        json={"name": "Folder A", "icon": "folder.fill"},
        headers=headers,
    ).json()["id"]
    folder_b = client.post(
        "/api/v1/folders",
        json={"name": "Folder B", "icon": "folder.fill"},
        headers=headers,
    ).json()["id"]

    note_id = client.post(
        "/api/v1/notes",
        json={
            "title": "Move Me",
            "transcript": "Text",
            "folder_id": folder_a,
        },
        headers=headers,
    ).json()["id"]

    delete_resp = client.delete(
        f"/api/v1/folders/{folder_a}?move_notes_to={folder_b}",
        headers=headers,
    )
    assert delete_resp.status_code == 204

    note_resp = client.get(f"/api/v1/notes/{note_id}", headers=headers)
    assert note_resp.status_code == 200
    assert note_resp.json()["folder_id"] == folder_b


def test_notes_folder_not_found_on_create(client):
    headers = _register_and_login(client, "notes-folder-missing@example.com")
    missing_id = str(uuid4())

    resp = client.post(
        "/api/v1/notes",
        json={
            "title": "Bad Folder",
            "transcript": "Text",
            "folder_id": missing_id,
        },
        headers=headers,
    )
    assert resp.status_code == 404

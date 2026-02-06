"""Google Calendar and Gmail integration services."""
import base64
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Optional, List

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from app.config import get_settings


class GoogleCalendarService:
    """Service for Google Calendar integration."""

    def __init__(self, access_token: str, refresh_token: Optional[str] = None):
        settings = get_settings()
        self.creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
        )

        # Refresh token if expired
        if self.creds.expired and self.creds.refresh_token:
            self.creds.refresh(Request())

        self.service = build('calendar', 'v3', credentials=self.creds)

    async def create_event(
        self,
        title: str,
        start_datetime: datetime,
        end_datetime: Optional[datetime] = None,
        location: Optional[str] = None,
        description: Optional[str] = None,
        attendees: Optional[List[str]] = None,
        timezone: str = "America/Chicago"
    ) -> dict:
        """
        Create a Google Calendar event.

        Returns:
            dict with event id, link, etc.
        """
        if end_datetime is None:
            end_datetime = start_datetime + timedelta(hours=1)

        event = {
            'summary': title,
            'start': {
                'dateTime': start_datetime.isoformat(),
                'timeZone': timezone,
            },
            'end': {
                'dateTime': end_datetime.isoformat(),
                'timeZone': timezone,
            },
        }

        if location:
            event['location'] = location

        if description:
            event['description'] = description

        if attendees:
            event['attendees'] = [{'email': email} for email in attendees]

        result = self.service.events().insert(
            calendarId='primary',
            body=event,
            sendUpdates='all' if attendees else 'none'
        ).execute()

        return {
            'id': result['id'],
            'html_link': result.get('htmlLink'),
            'status': result.get('status'),
        }

    async def list_events(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        max_results: int = 10
    ) -> List[dict]:
        """List upcoming calendar events."""
        if start_date is None:
            start_date = datetime.utcnow()
        if end_date is None:
            end_date = start_date + timedelta(days=7)

        events_result = self.service.events().list(
            calendarId='primary',
            timeMin=start_date.isoformat() + 'Z',
            timeMax=end_date.isoformat() + 'Z',
            maxResults=max_results,
            singleEvents=True,
            orderBy='startTime'
        ).execute()

        return events_result.get('items', [])

    async def delete_event(self, event_id: str) -> bool:
        """Delete a calendar event."""
        try:
            self.service.events().delete(
                calendarId='primary',
                eventId=event_id
            ).execute()
            return True
        except Exception:
            return False


class GmailService:
    """Service for Gmail integration."""

    def __init__(self, access_token: str, refresh_token: Optional[str] = None):
        settings = get_settings()
        self.creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
        )

        if self.creds.expired and self.creds.refresh_token:
            self.creds.refresh(Request())

        self.service = build('gmail', 'v1', credentials=self.creds)

    async def create_draft(
        self,
        to: str,
        subject: str,
        body: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> dict:
        """
        Create a Gmail draft.

        Returns:
            dict with draft id and message details
        """
        message = MIMEText(body)
        message['to'] = to
        message['subject'] = subject

        if cc:
            message['cc'] = ', '.join(cc)
        if bcc:
            message['bcc'] = ', '.join(bcc)

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        draft = self.service.users().drafts().create(
            userId='me',
            body={'message': {'raw': raw}}
        ).execute()

        return {
            'id': draft['id'],
            'message_id': draft['message']['id'],
        }

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        cc: Optional[List[str]] = None
    ) -> dict:
        """
        Send an email directly.

        Returns:
            dict with message id
        """
        message = MIMEText(body)
        message['to'] = to
        message['subject'] = subject

        if cc:
            message['cc'] = ', '.join(cc)

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        result = self.service.users().messages().send(
            userId='me',
            body={'raw': raw}
        ).execute()

        return {
            'id': result['id'],
            'thread_id': result.get('threadId'),
        }

    async def get_draft(self, draft_id: str) -> dict:
        """Get a draft by ID."""
        draft = self.service.users().drafts().get(
            userId='me',
            id=draft_id
        ).execute()
        return draft

    async def delete_draft(self, draft_id: str) -> bool:
        """Delete a draft."""
        try:
            self.service.users().drafts().delete(
                userId='me',
                id=draft_id
            ).execute()
            return True
        except Exception:
            return False

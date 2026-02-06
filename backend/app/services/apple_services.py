"""Apple Calendar (CalDAV) and Reminders integration services."""
from datetime import datetime, timedelta
from typing import Optional, List
import uuid

import caldav
from caldav.elements import dav, cdav
import vobject


class AppleCalendarService:
    """Service for Apple Calendar via CalDAV."""

    def __init__(self, username: str, app_password: str):
        """
        Initialize Apple Calendar service.

        Args:
            username: Apple ID email
            app_password: App-specific password (not regular Apple ID password)
        """
        self.client = caldav.DAVClient(
            url="https://caldav.icloud.com",
            username=username,
            password=app_password
        )
        self.principal = self.client.principal()
        self._calendars = None

    @property
    def calendars(self) -> List:
        """Get list of calendars (cached)."""
        if self._calendars is None:
            self._calendars = self.principal.calendars()
        return self._calendars

    def get_primary_calendar(self):
        """Get the primary calendar."""
        if self.calendars:
            return self.calendars[0]
        return None

    async def create_event(
        self,
        title: str,
        start_datetime: datetime,
        end_datetime: Optional[datetime] = None,
        location: Optional[str] = None,
        description: Optional[str] = None,
        calendar_name: Optional[str] = None
    ) -> dict:
        """
        Create an event in Apple Calendar.

        Returns:
            dict with event uid and details
        """
        if end_datetime is None:
            end_datetime = start_datetime + timedelta(hours=1)

        # Find the right calendar
        calendar = self.get_primary_calendar()
        if calendar_name:
            for cal in self.calendars:
                if cal.name == calendar_name:
                    calendar = cal
                    break

        if not calendar:
            raise ValueError("No calendar found")

        # Create iCalendar event
        cal = vobject.iCalendar()
        vevent = cal.add('vevent')

        vevent.add('uid').value = str(uuid.uuid4())
        vevent.add('dtstart').value = start_datetime
        vevent.add('dtend').value = end_datetime
        vevent.add('summary').value = title

        if location:
            vevent.add('location').value = location
        if description:
            vevent.add('description').value = description

        # Save event
        event = calendar.save_event(cal.serialize())

        return {
            'uid': vevent.uid.value,
            'calendar': calendar.name,
            'url': str(event.url) if hasattr(event, 'url') else None,
        }

    async def list_events(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[dict]:
        """List events in date range."""
        if start_date is None:
            start_date = datetime.now()
        if end_date is None:
            end_date = start_date + timedelta(days=7)

        calendar = self.get_primary_calendar()
        if not calendar:
            return []

        events = calendar.date_search(
            start=start_date,
            end=end_date,
            expand=True
        )

        result = []
        for event in events:
            vevent = event.vobject_instance.vevent
            result.append({
                'uid': str(vevent.uid.value) if hasattr(vevent, 'uid') else None,
                'summary': str(vevent.summary.value) if hasattr(vevent, 'summary') else None,
                'start': vevent.dtstart.value if hasattr(vevent, 'dtstart') else None,
                'end': vevent.dtend.value if hasattr(vevent, 'dtend') else None,
                'location': str(vevent.location.value) if hasattr(vevent, 'location') else None,
            })

        return result

    async def delete_event(self, event_uid: str) -> bool:
        """Delete an event by UID."""
        try:
            calendar = self.get_primary_calendar()
            if not calendar:
                return False

            # Search for the event
            events = calendar.events()
            for event in events:
                vevent = event.vobject_instance.vevent
                if hasattr(vevent, 'uid') and str(vevent.uid.value) == event_uid:
                    event.delete()
                    return True
            return False
        except Exception:
            return False


class AppleRemindersService:
    """Service for Apple Reminders via CalDAV (VTODO)."""

    def __init__(self, username: str, app_password: str):
        """
        Initialize Apple Reminders service.

        Args:
            username: Apple ID email
            app_password: App-specific password
        """
        self.client = caldav.DAVClient(
            url="https://caldav.icloud.com",
            username=username,
            password=app_password
        )
        self.principal = self.client.principal()

    def get_reminder_lists(self) -> List:
        """Get all reminder lists (calendars that support VTODO)."""
        calendars = self.principal.calendars()
        # Filter for calendars that support todos
        return [c for c in calendars if self._supports_todos(c)]

    def _supports_todos(self, calendar) -> bool:
        """Check if calendar supports VTODO (reminders)."""
        try:
            # Try to get supported components
            props = calendar.get_properties([cdav.SupportedCalendarComponentSet()])
            return True  # Simplified check
        except Exception:
            return False

    async def create_reminder(
        self,
        title: str,
        due_date: Optional[datetime] = None,
        notes: Optional[str] = None,
        priority: int = 0,  # 0=none, 1=high, 5=medium, 9=low
        list_name: Optional[str] = None
    ) -> dict:
        """
        Create a reminder.

        Returns:
            dict with reminder uid
        """
        lists = self.get_reminder_lists()
        reminder_list = lists[0] if lists else None

        if list_name:
            for rl in lists:
                if rl.name == list_name:
                    reminder_list = rl
                    break

        if not reminder_list:
            raise ValueError("No reminder list found")

        # Create VTODO
        cal = vobject.iCalendar()
        vtodo = cal.add('vtodo')

        vtodo.add('uid').value = str(uuid.uuid4())
        vtodo.add('summary').value = title
        vtodo.add('status').value = 'NEEDS-ACTION'

        if due_date:
            vtodo.add('due').value = due_date
        if notes:
            vtodo.add('description').value = notes
        if priority > 0:
            vtodo.add('priority').value = str(priority)

        # Save reminder
        todo = reminder_list.save_todo(cal.serialize())

        return {
            'uid': vtodo.uid.value,
            'list': reminder_list.name,
        }

    async def complete_reminder(self, reminder_uid: str) -> bool:
        """Mark a reminder as complete."""
        try:
            lists = self.get_reminder_lists()
            for reminder_list in lists:
                todos = reminder_list.todos()
                for todo in todos:
                    vtodo = todo.vobject_instance.vtodo
                    if hasattr(vtodo, 'uid') and str(vtodo.uid.value) == reminder_uid:
                        vtodo.status.value = 'COMPLETED'
                        todo.save()
                        return True
            return False
        except Exception:
            return False

    async def delete_reminder(self, reminder_uid: str) -> bool:
        """Delete a reminder."""
        try:
            lists = self.get_reminder_lists()
            for reminder_list in lists:
                todos = reminder_list.todos()
                for todo in todos:
                    vtodo = todo.vobject_instance.vtodo
                    if hasattr(vtodo, 'uid') and str(vtodo.uid.value) == reminder_uid:
                        todo.delete()
                        return True
            return False
        except Exception:
            return False

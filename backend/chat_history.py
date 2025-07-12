from datetime import datetime
from typing import List, Dict

class ChatHistoryManager:
    def _get_author_name(self, author_obj: Dict) -> str:
        """Safely get the author's display name or username."""
        if not author_obj:
            return "Unknown"
        return author_obj.get('global_name') or author_obj.get('username') or "Unknown"

    def format_messages_for_ai(self, messages: List[Dict]) -> str:
        """Format messages for AI processing."""
        formatted_messages = []
        for msg in messages:
            timestamp_str = msg.get('timestamp', '')
            try:
                if timestamp_str.endswith('Z'):
                    timestamp_dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                else:
                    timestamp_dt = datetime.fromisoformat(timestamp_str)
                timestamp = timestamp_dt.strftime('%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                timestamp = 'unknown time'

            author = self._get_author_name(msg.get('author', {}))
            content = msg.get('content', '')
            
            extras = []
            if msg.get('attachments'):
                extras.append(f"[{len(msg['attachments'])} attachment(s)]")
            if msg.get('embeds'):
                extras.append("[embed]")
            if msg.get('reactions'):
                reactions_list = msg.get('reactions', [])
                if isinstance(reactions_list, list):
                    reactions = ", ".join([f"{r.get('emoji', '?')}({r.get('count', 0)})" for r in reactions_list])
                    extras.append(f"[reactions: {reactions}]")
            
            extra_info = " " + " ".join(extras) if extras else ""
            formatted_msg = f"[{timestamp}] {author}: {content}{extra_info}"
            formatted_messages.append(formatted_msg)
        
        return "\n".join(formatted_messages)

    def get_conversation_stats(self, messages: List[Dict]) -> Dict:
        """Get statistics about the conversation."""
        if not messages:
            return {}
        
        total_messages = len(messages)
        
        author_names = [self._get_author_name(msg.get('author', {})) for msg in messages]
        participants = sorted(list(set(author_names)))
        
        message_counts = {p: 0 for p in participants}
        for name in author_names:
            message_counts[name] += 1
        
        first_message_ts = messages[0].get('timestamp')
        last_message_ts = messages[-1].get('timestamp')

        date_range = {"start": "N/A", "end": "N/A"}
        try:
            if first_message_ts:
                date_range["start"] = datetime.fromisoformat(first_message_ts.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M:%S')
            if last_message_ts:
                 date_range["end"] = datetime.fromisoformat(last_message_ts.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            pass # Keep default "N/A" on parsing error

        total_attachments = sum(len(msg.get('attachments', [])) for msg in messages)
        
        return {
            'total_messages': total_messages,
            'participants': participants,
            'message_counts': message_counts,
            'date_range': date_range,
            'total_attachments': total_attachments
            # chart_data is now generated in the main endpoint
        } 
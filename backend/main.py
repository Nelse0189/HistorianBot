import os
import ssl
import json
import asyncio
import aiohttp
import traceback
from fastapi import FastAPI, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

from ai_assistant import AIAssistant
from chat_history import ChatHistoryManager

load_dotenv()

app = FastAPI()

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Constants ---
API_BASE = "https://discord.com/api/v10"

# --- Pydantic Models ---
class TokenRequest(BaseModel):
    token: str

class ChannelRequest(BaseModel):
    token: str

class AnalyzeRequest(BaseModel):
    token: str
    channel_id: str

class Channel(BaseModel):
    id: str
    name: str

class QAPair(BaseModel):
    question: str
    answer: str

class AskRequest(BaseModel):
    token: str
    channel_id: str
    question: str
    qa_history: list[QAPair]

class AnalysisResult(BaseModel):
    stats: dict
    summary: dict

# --- Helper Functions ---
async def create_discord_session(token: str):
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    
    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
    return aiohttp.ClientSession(connector=connector, headers=headers)

# --- Endpoints ---
@app.post("/api/get-dm-channels")
async def get_dm_channels(req: ChannelRequest):
    session = await create_discord_session(req.token)
    try:
        async with session.get(f"{API_BASE}/users/@me/channels") as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status, detail="Failed to fetch DM channels. Your token may be invalid.")
            
            channels_data = await response.json()
            dm_channels = []
            for ch in channels_data:
                channel_name = None
                if ch.get('type') == 3: # Group DM
                    channel_name = ch.get('name') or ", ".join([r.get('global_name') or r.get('username') for r in ch.get('recipients', [])])
                elif ch.get('type') == 1: # Regular DM
                    if ch.get('recipients'):
                        recipient = ch['recipients'][0]
                        channel_name = recipient.get('global_name') or recipient.get('username')
                
                if channel_name:
                    dm_channels.append(Channel(id=ch['id'], name=channel_name))
            
            return dm_channels
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await session.close()


@app.post("/api/stream-analyze-channel")
async def stream_analyze_channel(req: AnalyzeRequest):
    async def event_generator():
        session = None
        try:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                yield {"event": "error", "data": "Google API key not found."}
                return

            session = await create_discord_session(req.token)
            
            messages = []
            last_id = None
            total_fetched = 0

            while True:
                limit = 100
                url = f"{API_BASE}/channels/{req.channel_id}/messages?limit={limit}"
                if last_id:
                    url += f"&before={last_id}"
                
                async with session.get(url) as response:
                    if response.status != 200:
                        yield {"event": "error", "data": "Failed to fetch messages."}
                        return
                    
                    batch = await response.json()
                    if not batch: break
                    
                    messages.extend(batch)
                    total_fetched += len(batch)
                    last_id = batch[-1]['id']

                    yield {"event": "progress", "data": json.dumps({"status": "fetching", "fetched": total_fetched})}
                    await asyncio.sleep(0.1)

            if not messages:
                yield {"event": "error", "data": "No messages found in this channel."}
                return

            yield {"event": "progress", "data": json.dumps({"status": "analyzing_emotions", "fetched": total_fetched})}

            history_manager = ChatHistoryManager()
            assistant = AIAssistant(api_key=api_key)
            
            daily_messages = {}
            for msg in messages:
                try:
                    dt = datetime.fromisoformat(msg.get('timestamp', '').replace('Z', '+00:00'))
                    date_key = dt.strftime('%Y-%m-%d')
                    if date_key not in daily_messages: daily_messages[date_key] = []
                    daily_messages[date_key].append(msg['content'])
                except (ValueError, TypeError): continue

            chart_data = []
            sorted_days = sorted(daily_messages.keys())
            for i, day in enumerate(sorted_days):
                day_text = "\\n".join(daily_messages[day])
                yield {"event": "progress", "data": json.dumps({"status": "analyzing_emotions", "day": day, "current": i + 1, "total": len(sorted_days)})}
                
                emotion_prompt = f"Analyze the sentiment of the following messages from a single day. Respond with a JSON object ONLY with keys \"happy\", \"calm\", \"anger\", \"neutral\". The values must be the integer count of messages in that category. Your response must be a valid JSON object and nothing else. Messages: {day_text[:15000]}"
                
                try:
                    emotion_result_raw = await assistant.answer_question(emotion_prompt)
                    json_str = emotion_result_raw['answer'].strip().replace('```json', '').replace('```', '')
                    emotion_counts = json.loads(json_str)
                    chart_data.append({"date": day, **emotion_counts})
                except (json.JSONDecodeError, KeyError):
                    chart_data.append({"date": day, "happy": 0, "calm": 0, "anger": 0, "neutral": len(daily_messages[day])})

            yield {"event": "progress", "data": json.dumps({"status": "processing", "fetched": total_fetched})}
            
            stats = history_manager.get_conversation_stats(messages)
            stats['chart_data'] = chart_data
            
            formatted_history = history_manager.format_messages_for_ai(messages)

            summary_prompt = "Provide a concise, one-paragraph summary of this conversation. Also, list the 3-5 main topics discussed."
            full_prompt = f"You are an AI assistant analyzing a Discord chat history.\\n\\n<CONVERSATION_STATS>\\n{stats}\\n</CONVERSATION_STATS>\\n\\n<CHAT_HISTORY>\\n{formatted_history}\\n</CHAT_HISTORY>\\n\\nBased on the provided chat history and statistics, please answer the following question.\\nQuestion: {summary_prompt}"
            summary_result = await assistant.answer_question(full_prompt)
            
            final_result = AnalysisResult(stats=stats, summary=summary_result).model_dump()
            yield {"event": "result", "data": json.dumps(final_result)}

        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": "An internal server error occurred."}
        finally:
            if session and not session.closed: await session.close()
            yield {"event": "close", "data": "Stream closed"}

    return EventSourceResponse(event_generator())


@app.post("/api/ask-question")
async def ask_question(request: AskRequest):
    session = await create_discord_session(request.token)
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Google API key not found.")

        messages = []
        last_id = None
        while True:
            limit = 100
            url = f"{API_BASE}/channels/{request.channel_id}/messages?limit={limit}"
            if last_id: url += f"&before={last_id}"
            
            async with session.get(url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch messages.")
                batch = await response.json()
                if not batch: break
                messages.extend(batch)
                last_id = batch[-1]['id']

        history_manager = ChatHistoryManager()
        formatted_history = history_manager.format_messages_for_ai(messages)
        
        conversation_context = "\\n".join([f"Q: {qa.question}\\nA: {qa.answer}" for qa in request.qa_history])
        
        prompt = f"You are an AI assistant analyzing a Discord chat history.\\nYou have already provided a summary and answered some questions.\\nUse the full chat history and the previous Q&A to answer the new question.\\n\\n<FULL_CHAT_HISTORY>\\n{formatted_history}\\n</FULL_CHAT_HISTORY>\\n\\n<PREVIOUS_Q_AND_A>\\n{conversation_context}\\n</PREVIOUS_Q_AND_A>\\n\\nNew Question: {request.question}"

        assistant = AIAssistant(api_key=api_key)
        answer = await assistant.answer_question(prompt)
        return answer

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="An error occurred while asking a question.")
    finally:
        if session and not session.closed: await session.close()


@app.post("/api/summarize-last-24h")
async def summarize_last_24h(req: AnalyzeRequest):
    session = await create_discord_session(req.token)
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Google API key not found.")

        messages = []
        last_id = None
        twenty_four_hours_ago_dt = datetime.now(timezone.utc) - timedelta(hours=24)

        while True:
            limit = 100
            url = f"{API_BASE}/channels/{req.channel_id}/messages?limit={limit}"
            if last_id:
                url += f"&before={last_id}"

            async with session.get(url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch messages.")
                
                batch = await response.json()
                if not batch:
                    break

                # Filter messages and check if we need to continue fetching
                batch_ended_early = False
                for msg in batch:
                    msg_dt = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
                    if msg_dt > twenty_four_hours_ago_dt:
                        messages.append(msg)
                    else:
                        batch_ended_early = True
                        break # Stop processing this batch
                
                if batch_ended_early or len(batch) < limit:
                    break # Stop fetching more pages

                last_id = batch[-1]['id']

        if not messages:
            return {"summary": "No messages found in the last 24 hours."}
        
        # Messages are returned newest to oldest, reverse them for chronological order in the summary
        messages.reverse()

        history_manager = ChatHistoryManager()
        formatted_history = history_manager.format_messages_for_ai(messages)
        
        summary_prompt = "Provide a concise, one-paragraph summary of the conversation from the last 24 hours."
        full_prompt = f"You are an AI assistant analyzing a Discord chat history.\\n\\n<CHAT_HISTORY>\\n{formatted_history}\\n</CHAT_HISTORY>\\n\\nBased on the provided chat history, please answer the following question.\\nQuestion: {summary_prompt}"

        assistant = AIAssistant(api_key=api_key)
        summary_result = await assistant.answer_question(full_prompt)
        
        return {"summary": summary_result['answer']}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="An error occurred while generating the summary.")
    finally:
        if session and not session.closed: await session.close()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/api/verify-token")
async def verify_token(request: TokenRequest):
    session = await create_discord_session(request.token)
    try:
        async with session.get(f"{API_BASE}/users/@me") as response:
            if response.status == 200:
                user_data = await response.json()
                return {"success": True, "user": user_data}
            else:
                return {"success": False, "error": "Invalid token"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await session.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
import google.generativeai as genai

class AIAssistant:
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash-latest"):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    async def answer_question(self, prompt: str) -> dict:
        """
        Sends a prompt to the Gemini API and returns the response and token usage.
        """
        response = await self.model.generate_content_async(prompt)
        
        # Extract token usage
        usage = {
            "input_tokens": response.usage_metadata.prompt_token_count,
            "output_tokens": response.usage_metadata.candidates_token_count,
        }
        
        return {
            "answer": response.text,
            "usage": usage
        } 
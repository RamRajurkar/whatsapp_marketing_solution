"""
Channel-Agnostic AI Generation Engine.
Generates replies for GBP reviews, promotional GBP posts, and WhatsApp conversational responses.
"""

from typing import Optional, Dict, Any
import httpx
import os

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

class AIEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENAI_API_KEY

    async def generate_review_reply(
        self,
        business_name: str,
        reviewer_name: str,
        star_rating: int,
        review_text: Optional[str] = None,
        tone: str = "professional",
    ) -> str:
        """
        Generate a personalized, sentiment-aware reply to a Google Business Review.
        """
        if star_rating >= 4:
            sentiment_prompt = "Express genuine gratitude, mention looking forward to seeing them again, and reinforce customer delight."
        elif star_rating == 3:
            sentiment_prompt = "Thank them for their feedback, acknowledge that we aim for 5-star experiences, and invite them to share how we can improve."
        else:
            sentiment_prompt = "Express sincere regret for their poor experience, take responsibility without being overly defensive, and provide a direct manager contact or request to reach out to make things right."

        # If no OpenAI API key configured, use rule-based smart fallback
        if not self.api_key:
            if star_rating >= 4:
                return f"Thank you so much, {reviewer_name}! We are thrilled you enjoyed your experience at {business_name}. We look forward to serving you again soon!"
            elif star_rating == 3:
                return f"Thank you for your review, {reviewer_name}. We appreciate your constructive feedback and are constantly striving to improve our services at {business_name}."
            else:
                return f"Dear {reviewer_name}, we are truly sorry that your experience did not meet expectations. Please reach out to our management directly so we can make things right."

        # OpenAI LLM Call
        prompt = (
            f"You are the manager of '{business_name}'. Write a {tone} reply to this Google Review.\n"
            f"Reviewer: {reviewer_name}\n"
            f"Star Rating: {star_rating}/5\n"
            f"Review text: \"{review_text or 'No written comment'}\"\n"
            f"Guidance: {sentiment_prompt}\n"
            f"Keep the reply concise (2-4 sentences)."
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 150,
                        "temperature": 0.7,
                    }
                )
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            pass

        return f"Thank you for sharing your feedback with {business_name}, {reviewer_name}!"

    async def generate_gbp_post(
        self,
        business_name: str,
        topic: str,
        keywords: Optional[list] = None,
        call_to_action: str = "LEARN_MORE"
    ) -> str:
        """
        Generate an engaging Google Business Profile promotional post with local SEO keywords.
        """
        kw_str = ", ".join(keywords) if keywords else "quality, service, trusted"
        return (
            f"🌟 Exciting updates at {business_name}! Discover our latest {topic}. "
            f"Featuring {kw_str} tailored for our valued customers. Visit us today or click below to explore more!"
        )

ai_engine = AIEngine()

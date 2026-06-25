"""
Utility functions for building WhatsApp Cloud API template component payloads.

When sending a template message via the WhatsApp Cloud API, templates that
contain parameterized components (media headers, body variables {{1}} {{2}},
carousel cards, etc.) require a `components` array in the send payload.

This module inspects the template's component definitions (fetched from Meta
at template-list time) and merges them with user-supplied parameter values
to produce the correct `components` list for the Messages API.
"""

import re
from typing import Optional, List, Dict, Any
import httpx


def build_template_components(
    template_components: List[Dict[str, Any]],
    header_media_url: Optional[str] = None,
    header_media_id: Optional[str] = None,
    body_params: Optional[List[str]] = None,
    carousel_cards: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Build the `components` array for a WhatsApp template send request.

    Args:
        template_components: The component definitions from the template
                             (as returned by the Meta Business API).
        header_media_url:    URL for a media header (IMAGE, VIDEO, DOCUMENT).
        header_media_id:     Media ID from WhatsApp API for a media header.
        body_params:         Values for body text variables {{1}}, {{2}}, etc.
        carousel_cards:      List of dicts with per-card params. Each dict can
                             contain `mediaUrl` and/or `bodyParams`.

    Returns:
        A list of component dicts ready for the Messages API payload.
        Returns an empty list when no components are needed.
    """
    components: List[Dict[str, Any]] = []

    for comp in template_components:
        comp_type = comp.get("type", "").upper()

        # ── HEADER with media ────────────────────────────────────────────
        if comp_type == "HEADER":
            fmt = comp.get("format", "").upper()
            if fmt in ("IMAGE", "VIDEO", "DOCUMENT") and (header_media_url or header_media_id):
                media_type = fmt.lower()  # "image", "video", "document"
                media_obj = {}
                if header_media_id:
                    media_obj = {"id": header_media_id}
                else:
                    media_obj = {"link": header_media_url}
                    
                components.append({
                    "type": "header",
                    "parameters": [
                        {
                            "type": media_type,
                            media_type: media_obj,
                        }
                    ],
                })

        # ── BODY with variables ──────────────────────────────────────────
        elif comp_type == "BODY":
            body_text = comp.get("text", "")
            var_slots = re.findall(r"\{\{(\d+)\}\}", body_text)
            if var_slots and body_params:
                parameters = []
                for idx in sorted(int(v) for v in var_slots):
                    # body_params is 0-indexed; template vars are 1-indexed
                    value = body_params[idx - 1] if idx - 1 < len(body_params) else ""
                    parameters.append({"type": "text", "text": value})
                components.append({
                    "type": "body",
                    "parameters": parameters,
                })

        # ── CAROUSEL ─────────────────────────────────────────────────────
        elif comp_type == "CAROUSEL" and carousel_cards:
            cards = []
            card_templates = comp.get("cards", [])
            for i, card_params in enumerate(carousel_cards):
                card_components = []
                # If there's a card template definition, use it
                card_def = card_templates[i] if i < len(card_templates) else {}
                card_def_components = card_def.get("components", [])

                for card_comp in card_def_components:
                    card_comp_type = card_comp.get("type", "").upper()

                    if card_comp_type == "HEADER":
                        card_fmt = card_comp.get("format", "").upper()
                        card_media_url = card_params.get("mediaUrl", "")
                        if card_fmt in ("IMAGE", "VIDEO") and card_media_url:
                            media_type = card_fmt.lower()
                            card_components.append({
                                "type": "header",
                                "parameters": [
                                    {
                                        "type": media_type,
                                        media_type: {"link": card_media_url},
                                    }
                                ],
                            })

                    elif card_comp_type == "BODY":
                        card_body_text = card_comp.get("text", "")
                        card_var_slots = re.findall(r"\{\{(\d+)\}\}", card_body_text)
                        card_body_params = card_params.get("bodyParams", [])
                        if card_var_slots and card_body_params:
                            parameters = []
                            for idx in sorted(int(v) for v in card_var_slots):
                                value = card_body_params[idx - 1] if idx - 1 < len(card_body_params) else ""
                                parameters.append({"type": "text", "text": value})
                            card_components.append({
                                "type": "body",
                                "parameters": parameters,
                            })

                    elif card_comp_type == "BUTTON":
                        # Buttons with dynamic URLs need the URL suffix
                        buttons = card_comp.get("buttons", []) if isinstance(card_comp.get("buttons"), list) else []
                        button_params = card_params.get("buttonParams", [])
                        for btn_idx, btn in enumerate(buttons):
                            if btn.get("type") == "URL" and "{{1}}" in btn.get("url", ""):
                                btn_value = button_params[btn_idx] if btn_idx < len(button_params) else ""
                                card_components.append({
                                    "type": "button",
                                    "sub_type": "url",
                                    "index": str(btn_idx),
                                    "parameters": [
                                        {"type": "text", "text": btn_value}
                                    ],
                                })

                cards.append({
                    "card_index": i,
                    "components": card_components,
                })

            components.append({
                "type": "carousel",
                "cards": cards,
            })

        # ── BUTTONS with dynamic parameters ──────────────────────────────
        elif comp_type == "BUTTONS":
            buttons = comp.get("buttons", [])
            for btn_idx, btn in enumerate(buttons):
                if btn.get("type") == "URL" and "{{1}}" in btn.get("url", ""):
                    # Dynamic URL button — would need a parameter
                    # For now we skip unless we get button params in the future
                    pass

    return components


async def fetch_template_components(
    wa_business_id: str,
    wa_token: str,
    template_name: str,
) -> List[Dict[str, Any]]:
    """
    Fetch a template's component definitions from the Meta Business API.

    Returns the `components` list for the matching template, or an empty list
    if the template is not found.
    """
    url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_business_id}/message_templates"
    headers = {"Authorization": f"Bearer {wa_token}"}
    params = {"name": template_name}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()

    for t in data.get("data", []):
        if t.get("name") == template_name:
            return t.get("components", [])

    return []

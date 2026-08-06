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
import os
import mimetypes
import logging
from typing import Optional, List, Dict, Any
from fastapi import HTTPException
import httpx
from app.http_client import get_http_client
from app.config import settings
from app.utils.image_utils import compress_image_bytes

logger = logging.getLogger(__name__)


def build_template_components(
    template_components: List[Dict[str, Any]],
    header_media_url: Optional[str] = None,
    header_media_id: Optional[str] = None,
    body_params: Optional[List[str]] = None,
    carousel_cards: Optional[List[Dict[str, Any]]] = None,
    button_params: Optional[List[str]] = None,
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
            elif fmt == "TEXT":
                header_text = comp.get("text", "")
                if "{{1}}" in header_text and body_params:
                    header_val = body_params[0]
                    components.append({
                        "type": "header",
                        "parameters": [{"type": "text", "text": header_val}]
                    })

        # ── BODY with variables ──────────────────────────────────────────
        elif comp_type == "BODY":
            body_text = comp.get("text", "")
            raw_slots = re.findall(r"\{\{([^}]+)\}\}", body_text)
            if raw_slots and body_params:
                # Deduplicate while preserving order
                var_slots = []
                for v in raw_slots:
                    if v not in var_slots:
                        var_slots.append(v)

                is_positional = all(v.isdigit() for v in var_slots)
                parameters = []
                if is_positional:
                    for idx in sorted(int(v) for v in var_slots):
                        value = body_params[idx - 1] if idx - 1 < len(body_params) else ""
                        parameters.append({"type": "text", "text": value})
                else:
                    for idx, var_name in enumerate(var_slots):
                        value = body_params[idx] if idx < len(body_params) else ""
                        parameters.append({
                            "type": "text",
                            "parameter_name": var_name,
                            "text": value
                        })
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
                        raw_card_vars = re.findall(r"\{\{([^}]+)\}\}", card_body_text)
                        card_body_params = card_params.get("bodyParams", [])
                        if raw_card_vars and card_body_params:
                            card_var_slots = []
                            for v in raw_card_vars:
                                if v not in card_var_slots:
                                    card_var_slots.append(v)

                            is_positional = all(v.isdigit() for v in card_var_slots)
                            parameters = []
                            if is_positional:
                                for idx in sorted(int(v) for v in card_var_slots):
                                    value = card_body_params[idx - 1] if idx - 1 < len(card_body_params) else ""
                                    parameters.append({"type": "text", "text": value})
                            else:
                                for idx, var_name in enumerate(card_var_slots):
                                    value = card_body_params[idx] if idx < len(card_body_params) else ""
                                    parameters.append({
                                        "type": "text",
                                        "parameter_name": var_name,
                                        "text": value
                                    })
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
                btn_type = btn.get("type", "").upper()

                if btn_type == "URL" and "{{1}}" in btn.get("url", ""):
                    # Dynamic URL button — needs URL suffix parameter
                    given_val = button_params[btn_idx] if button_params and btn_idx < len(button_params) else ""
                    example_val = (btn.get("example", ["offer"])[0] if isinstance(btn.get("example"), list) and btn.get("example") else "offer")
                    btn_value = given_val.strip() if given_val and given_val.strip() else example_val

                    components.append({
                        "type": "button",
                        "sub_type": "url",
                        "index": str(btn_idx),
                        "parameters": [
                            {"type": "text", "text": btn_value}
                        ],
                    })

                elif btn_type == "COPY_CODE":
                    # Copy-code button — needs the coupon code as a parameter
                    given_val = button_params[btn_idx] if button_params and btn_idx < len(button_params) else ""
                    example_val = (btn.get("example", ["SAVE10"])[0] if isinstance(btn.get("example"), list) and btn.get("example") else "SAVE10")
                    btn_value = given_val.strip() if given_val and given_val.strip() else example_val

                    components.append({
                        "type": "button",
                        "sub_type": "COPY_CODE",
                        "index": str(btn_idx),
                        "parameters": [
                            {"type": "coupon_code", "coupon_code": btn_value}
                        ],
                    })

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

    client = get_http_client()
    resp = await client.get(url, headers=headers, params=params)
    if resp.status_code != 200:
        return []
    data = resp.json()

    for t in data.get("data", []):
        if t.get("name") == template_name:
            return t.get("components", [])

    return []


async def upload_media_to_meta(file_bytes: bytes, filename: str, file_type: str, wa_phone_id: str, wa_token: str) -> str:
    """Helper to upload media bytes to Meta's WhatsApp Graph API media endpoint."""
    upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/media"
    upload_files = {"file": (filename, file_bytes, file_type)}
    upload_data = {"messaging_product": "whatsapp"}
    upload_headers = {"Authorization": f"Bearer {wa_token}"}

    client = get_http_client()
    resp = await client.post(upload_url, headers=upload_headers, data=upload_data, files=upload_files)
    if resp.status_code in (200, 201):
        return resp.json().get("id")
    else:
        err_msg = resp.json().get("error", {}).get("message", resp.text)
        raise HTTPException(status_code=400, detail=f"WhatsApp Media Upload Error: {err_msg}")


async def process_header_media(
    header_media_url: Optional[str],
    header_media_id: Optional[str],
    wa_phone_id: str,
    wa_token: str,
) -> tuple[Optional[str], Optional[str]]:
    """
    Validates and prepares header media for WhatsApp template send.
    - Returns (final_header_url, final_header_id)
    - If media_id is provided, uses it directly.
    - If media_url is a local file or external HTTP(S) link, fetches and validates content type.
    - If content-type is text/html or unsupported, raises a friendly HTTPException.
    - Auto-uploads valid media bytes to WhatsApp API as a Media ID to guarantee Meta never fails with #131053.
    """
    if header_media_id:
        return None, header_media_id

    if not header_media_url:
        return None, None

    url = header_media_url.strip()
    if not url:
        return None, None

    # Case 1: Local file URL
    if "localhost" in url or "/uploads/" in url:
        filename = url.split("/")[-1].split("?")[0]
        local_path = os.path.join("uploads", "media", filename)
        if not os.path.exists(local_path):
            raise HTTPException(status_code=400, detail=f"Local media file not found: {local_path}")
        
        file_type, _ = mimetypes.guess_type(local_path)
        file_type = file_type or "image/jpeg"
        with open(local_path, "rb") as f:
            file_bytes = f.read()
        file_bytes, filename, file_type = compress_image_bytes(file_bytes, filename, file_type)
        media_id = await upload_media_to_meta(file_bytes, filename, file_type, wa_phone_id, wa_token)
        return None, media_id

    # Case 2: External HTTP / HTTPS link
    if url.startswith("http://") or url.startswith("https://"):
        try:
            client = get_http_client()
            resp = await client.get(url, follow_redirects=True, timeout=12.0)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not download image from link (HTTP {resp.status_code}). Please provide a direct public image URL."
                )

            content_type = resp.headers.get("content-type", "").lower()
            if "text/html" in content_type or resp.content.startswith(b"<!DOCTYPE") or resp.content.startswith(b"<html"):
                raise HTTPException(
                    status_code=400,
                    detail="The provided URL points to an HTML webpage (text/html) rather than a direct image file. Please use a direct image link (ending in .jpg, .png, .webp) or upload the image file directly."
                )

            mime = content_type.split(";")[0].strip()
            if mime and not any(mime.startswith(prefix) for prefix in ["image/", "video/", "application/pdf"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported media type '{mime}'. Please use a valid image (JPEG, PNG, WEBP), video, or PDF document."
                )

            # Auto-upload downloaded media bytes to WhatsApp API as a Media ID
            ext = mimetypes.guess_extension(mime) or ".jpg"
            filename = f"header_media{ext}"
            file_bytes, filename, mime = compress_image_bytes(resp.content, filename, mime or "image/jpeg")
            media_id = await upload_media_to_meta(file_bytes, filename, mime, wa_phone_id, wa_token)
            return None, media_id

        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Failed to pre-download external media URL {url}: {e}")
            # Fall back to passing raw link if fetch failed due to temporary network error
            return url, None

    return url, None


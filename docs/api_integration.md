# 🔌 RestoChat API Integration Documentation

This document describes the complete API surface of the **RestoChat WhatsApp Marketing Solution**.

---

## 🔐 Authentication & Global Request Headers

Except for public endpoints (such as fetching branding parameters or incoming webhook verification), all routes are protected and require a valid JSON Web Token (JWT).

### Headers
Include the JWT token in your request headers as follows:
```http
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

---

## 🔑 Authentication Endpoints (`/api/auth`)

### 1. Registration Status
*   **Path**: `GET /api/auth/registration-status`
*   **Auth Required**: No
*   **Description**: Used on startup to check if any user has registered. If `false`, the frontend routes to the registration screen.
*   **Response (`200 OK`)**:
    ```json
    { "registered": true }
    ```

### 2. Register Admin User
*   **Path**: `POST /api/auth/register`
*   **Auth Required**: No (Only allowed if no user exists in MongoDB)
*   **Rate Limit**: 5 requests per minute
*   **Payload**:
    ```json
    {
      "email": "admin@restaurant.com",
      "password": "SecurePassword123",
      "restaurantName": "Spice Garden"
    }
    ```
*   **Response (`200 OK`)**:
    ```json
    {
      "token": "eyJhbGciOi...",
      "user": {
        "_id": "603f...",
        "email": "admin@restaurant.com",
        "restaurantName": "Spice Garden",
        "createdAt": "2026-07-13T12:00:00Z",
        "updatedAt": "2026-07-13T12:00:00Z"
      }
    }
    ```

### 3. Login
*   **Path**: `POST /api/auth/login`
*   **Auth Required**: No
*   **Rate Limit**: 10 requests per minute
*   **Payload**:
    ```json
    {
      "email": "admin@restaurant.com",
      "password": "SecurePassword123"
    }
    ```
*   **Response (`200 OK`)**:
    *   *Returns JWT Token + user profile info.*

### 4. Fetch Current User Profile
*   **Path**: `GET /api/auth/me`
*   **Auth Required**: Yes
*   **Response (`200 OK`)**:
    ```json
    {
      "_id": "603f...",
      "email": "admin@restaurant.com",
      "restaurantName": "Spice Garden",
      "createdAt": "2026-07-13T12:00:00Z",
      "updatedAt": "2026-07-13T12:00:00Z"
    }
    ```

---

## ⚙️ Settings & Customization (`/api/settings`)

### 1. Get Settings
*   **Path**: `GET /api/settings`
*   **Auth Required**: Yes
*   **Response (`200 OK`)**:
    ```json
    {
      "restaurantName": "Spice Garden",
      "businessName": "Spice Garden Inc.",
      "address": "123 Food Street, New Delhi",
      "contactNumber": "+919876543210",
      "waPhoneNumberId": "1092837482937",
      "waBusinessAccountId": "2093847293749",
      "waAccessToken": "EAAG...",
      "waVerifyToken": "my_secret_token_123",
      "email": "admin@restaurant.com"
    }
    ```

### 2. Update Settings
*   **Path**: `PATCH /api/settings`
*   **Auth Required**: Yes
*   **Payload**:
    *   *Takes any optional fields from `SettingsUpdate` model (e.g. `restaurantName`, `waAccessToken`, or new `password`).*

### 3. Test Meta API Connection
*   **Path**: `POST /api/settings/test-connection`
*   **Auth Required**: Yes
*   **Description**: Pings Meta's Graph API using configured credentials to verify connection status.
*   **Response (`200 OK`)**:
    ```json
    {
      "message": "Connection successful",
      "phoneInfo": {
        "id": "1092837482937",
        "display_phone_number": "+91 98765 43210"
      }
    }
    ```

### 4. Fetch Public Branding
*   **Path**: `GET /api/settings/branding`
*   **Auth Required**: No (Used on Login screen to apply custom visual templates)
*   **Response (`200 OK`)**:
    ```json
    {
      "appName": "RestoChat",
      "tagline": "WhatsApp Marketing Solution",
      "logoPath": "http://localhost:5000/uploads/branding/logo.png",
      "loginBgPath": "http://localhost:5000/uploads/branding/loginBg.png",
      "primaryColor": "#1B5E37",
      "accentColor": "#2E7D4F",
      "darkColor": "#0d2b1a",
      "impactLines": ["Line 1", "Line 2"],
      "trustStats": [
        { "number": "10K+", "label": "Messages / Day" }
      ]
    }
    ```

### 5. Update Branding Settings
*   **Path**: `PATCH /api/settings/branding`
*   **Auth Required**: Yes
*   **Payload**:
    *   *Updates branding values (e.g. custom hex colors or app name).*

### 6. Upload Branding Images
*   **Path**: `POST /api/settings/upload-branding`
*   **Auth Required**: Yes
*   **Payload (Multipart Form)**:
    *   `type`: String ("logo" or "loginBg")
    *   `file`: Binary file upload (PNG/JPEG)
*   **Response (`200 OK`)**:
    ```json
    {
      "message": "Image uploaded successfully",
      "url": "http://localhost:5000/uploads/branding/logo.png?v=17192837"
    }
    ```

---

## 👥 Customer Profile Management (`/api/customers`)

### 1. List Customers
*   **Path**: `GET /api/customers`
*   **Params**: `search` (Optional name/phone string), `limit` (Default 100)
*   **Response (`200 OK`)**:
    ```json
    {
      "customers": [
        {
          "_id": "65b...",
          "name": "Jane Doe",
          "phone": "919876543210",
          "waId": "919876543210",
          "tags": ["VIP Customer"],
          "notes": "Prefers corner tables.",
          "createdAt": "2026-07-13T12:00:00Z"
        }
      ],
      "total": 1
    }
    ```

### 2. Create Customer
*   **Path**: `POST /api/customers`
*   **Payload**:
    ```json
    {
      "name": "John Doe",
      "phone": "9876543210",
      "tags": ["Vegetarian"],
      "notes": "No dairy products."
    }
    ```
*   **Description**: Normalizes the phone number dynamically to standard E.164 format.

### 3. Update Customer Details
*   **Path**: `PATCH /api/customers/{customer_id}`
*   **Description**: Updates customer profile. Updates sync to the conversation documents to ensure inbox displays the correct name.

### 4. Delete Customer
*   **Path**: `DELETE /api/customers/{customer_id}`

---

## 💬 Conversation & Messaging History (`/api/conversations`)

### 1. List Recent Conversations
*   **Path**: `GET /api/conversations`
*   **Params**: `search` (Search query), `limit` (Default 100)
*   **Response (`200 OK`)**:
    ```json
    {
      "conversations": [
        {
          "_id": "60a...",
          "customerPhone": "919876543210",
          "customerName": "Jane Doe",
          "lastMessage": "I would like to book a table.",
          "lastMessageTime": "2026-07-13T12:05:00Z",
          "unreadCount": 2,
          "status": "active"
        }
      ]
    }
    ```

### 2. Get Messages (Paginated History)
*   **Path**: `GET /api/conversations/{conversation_id}/messages`
*   **Params**: `page` (Default 1), `page_size` (Default 50, max 200)
*   **Description**: Retrieves message history for the conversation sorted chronologically. Automatically resets the conversation `unreadCount` to `0` in MongoDB.
*   **Response (`200 OK`)**:
    ```json
    {
      "messages": [
        {
          "_id": "60b...",
          "conversationId": "60a...",
          "direction": "inbound",
          "type": "text",
          "content": { "text": "Hi" },
          "status": "delivered",
          "timestamp": "2026-07-13T12:00:00Z"
        }
      ],
      "total": 1,
      "page": 1,
      "page_size": 50,
      "has_more": false
    }
    ```

### 3. Send Text Message (Within Conversation)
*   **Path**: `POST /api/conversations/{conversation_id}/send-text`
*   **Payload**:
    ```json
    { "text": "Hello! Your table is confirmed." }
    ```
*   **Description**: Sends message via WhatsApp, updates the conversation status, inserts the outbound message, and emits a socket event to sync the UI in real-time.

### 4. Upload & Send Media (Within Conversation)
*   **Path**: `POST /api/conversations/{conversation_id}/upload-and-send`
*   **Payload (Multipart Form)**:
    *   `file`: Binary media file
    *   `caption`: Optional message caption
*   **Description**: Uploads the file to Meta's servers first to obtain a `media_id`, then dispatches the media message.

### 5. Send Template (Within Conversation)
*   **Path**: `POST /api/conversations/{conversation_id}/send-template`
*   **Payload**:
    ```json
    {
      "templateName": "reservation_confirm",
      "templateLanguage": "en_US",
      "templateComponents": [...],
      "bodyParams": ["Jane", "7:30 PM"]
    }
    ```

### 6. Delete Conversation & History
*   **Path**: `DELETE /api/conversations/{conversation_id}`
*   **Description**: Deletes the conversation record and all nested message history.

---

## 📢 Broadcast Campaigns (`/api/broadcasts`)

### 1. List Broadcast Campaigns
*   **Path**: `GET /api/broadcasts`
*   **Description**: Returns all campaign drafts, scheduled items, and sent campaigns sorted by creation date.

### 2. Create Broadcast Campaign
*   **Path**: `POST /api/broadcasts`
*   **Payload**:
    ```json
    {
      "name": "Weekend Festival Promo",
      "templateName": "weekend_discount_banner",
      "templateLanguage": "en",
      "audienceTags": ["VIP Customer"],
      "scheduledAt": "2026-07-18T10:00:00Z",
      "templateComponents": [...],
      "headerMediaUrl": "http://localhost:5000/uploads/media/promo.png"
    }
    ```

### 3. Update Broadcast Campaign
*   **Path**: `PUT /api/broadcasts/{broadcast_id}`
*   **Description**: Edit campaign properties. (Only allowed on campaigns in `draft` or `scheduled` status).

### 4. Dispatch Campaign (Asynchronous Send)
*   **Path**: `POST /api/broadcasts/{broadcast_id}/send`
*   **Description**: Triggers a background process. Sets status to `sending` and pushes the task to Celery.
*   **Response (`200 OK`)**:
    ```json
    {
      "message": "Broadcast queued. Sending to 150 customers via Celery worker.",
      "total": 150,
      "status": "sending",
      "taskId": "7a3b-2837..."
    }
    ```

### 5. Get Real-Time Send Progress (Polling Fallback)
*   **Path**: `GET /api/broadcasts/{broadcast_id}/progress`
*   **Response (`200 OK`)**:
    ```json
    {
      "broadcastId": "65c...",
      "status": "sending",
      "sent": 120,
      "failed": 2,
      "total": 150,
      "percentage": 81.3
    }
    ```

### 6. Delete Campaign
*   **Path**: `DELETE /api/broadcasts/{broadcast_id}`

---

## 🤖 Chatbot Settings & Playground (`/api/bot`)

### 1. Retrieve Chatbot Configuration
*   **Path**: `GET /api/bot`
*   **Response (`200 OK`)**:
    ```json
    {
      "isActive": true,
      "welcomeMessage": "Welcome! How can we help you today?",
      "addressText": "We are at 123 Food Street.",
      "menuUrl": "https://restaurant.com/menu.pdf",
      "timingsText": "Open daily 10 AM - 11 PM",
      "openHour": 11,
      "closeHour": 23
    }
    ```

### 2. Update Chatbot Settings
*   **Path**: `POST /api/bot`
*   **Description**: Saves the settings and calls `invalidate_cache()` to clear Redis memory immediately.

---

## 🍽️ Booking Reservations (`/api/reservations`)

### 1. List Reservations
*   **Path**: `GET /api/reservations`
*   **Params**: `status` (Optional filter: `Pending`, `Confirmed`, `Cancelled`, `Completed`)
*   **Response (`200 OK`)**:
    ```json
    {
      "data": [
        {
          "_id": "60a...",
          "guestName": "Jane Doe",
          "phone": "919876543210",
          "guests": "4",
          "date": "25 June",
          "time": "7:30 PM",
          "status": "Pending",
          "createdAt": "2026-07-13T12:00:00Z"
        }
      ]
    }
    ```

### 2. Update Reservation Status
*   **Path**: `PATCH /api/reservations/{res_id}/status`
*   **Payload**:
    ```json
    { "status": "Completed" }
    ```
*   **Description**: Updates reservation status. If set to `Completed`, the backend automatically sends a feedback request template to the user's WhatsApp number and creates a `feedback_states` record.

### 3. Delete Reservation
*   **Path**: `DELETE /api/reservations/{res_id}`

---

## 💬 Quick Snippets & FAQs (`/api/quick-replies` & `/api/faq`)

### 1. List Quick Replies
*   **Path**: `GET /api/quick-replies`

### 2. Create Quick Reply
*   **Path**: `POST /api/quick-replies`
*   **Payload**:
    ```json
    {
      "title": "Welcome Discount",
      "body": "Welcome! Use code RESTO10 for a 10% discount on your first order.",
      "category": "Offers"
    }
    ```

### 3. Record Quick Reply Usage
*   **Path**: `POST /api/quick-replies/{reply_id}/use`
*   **Description**: Increments `usageCount` by `1` in MongoDB.

### 4. List FAQ Keywords
*   **Path**: `GET /api/faq`

### 5. Create FAQ
*   **Path**: `POST /api/faq`
*   **Payload**:
    ```json
    {
      "keywords": ["parking", "valet", "car"],
      "answer": "Yes, we offer free valet parking for our diners.",
      "isActive": true
    }
    ```

---

## 📊 Analytics & Reporting (`/api/reports`)

### 1. Dashboard Metrics
*   **Path**: `GET /api/reports/dashboard`
*   **Response (`200 OK`)**:
    ```json
    {
      "totalCustomers": 1240,
      "newCustomersToday": 14,
      "activeConversations": 12,
      "reservationsToday": 0,
      "recentConversations": [...]
    }
    ```

### 2. Time-Series Analytics
*   **Path**: `GET /api/reports/analytics`
*   **Params**: `days` (Default 7)
*   **Description**: Aggregates outbound/inbound metrics and broadcast analytics over the specified timeframe.

---

## 📡 Webhook Management & Inbound Gateways (`/api/webhook`)

### 1. Meta Webhook Subscription Verification
*   **Path**: `GET /api/webhook`
*   **Params**: `hub.mode`, `hub.verify_token`, `hub.challenge`
*   **Description**: Responds to Meta's verification request if the verification token matches the database value.

### 2. Receive Meta Webhook POST payload
*   **Path**: `POST /api/webhook`
*   **Description**: Receives incoming events from Meta. If configured, validates the payload signature using `X-Hub-Signature-256`. Spawns an async background task to update the database, trigger socket events, and run chatbot logic.

### 3. Webhook Simulation (Playground Developer Tool)
*   **Path**: `POST /api/webhook/simulate`
*   **Description**: Simulates sending a WhatsApp webhook event for testing.
*   **Payload**:
    ```json
    {
      "senderPhone": "9876543210",
      "senderName": "Simulated Guest",
      "messageText": "book a table",
      "messageType": "text"
    }
    ```
*   **Response (`200 OK`)**:
    *   *Simulates the payload, executes the matching chatbot rules, and returns the chatbot's responses.*

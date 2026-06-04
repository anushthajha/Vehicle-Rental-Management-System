# SigFleet Graph

Generated from `/Users/as-mac-1196/Desktop/gen AI/sigFleet`.

```mermaid
flowchart LR
  User[Browser User] --> Frontend[React Frontend]
  Frontend --> ApiClient[frontend/src/services/api.js]
  ApiClient --> Backend[FastAPI Backend]

  Frontend --> PublicPages[Public Pages]
  Frontend --> CustomerPages[Customer Dashboard]
  Frontend --> ManagerPages[Manager Console]
  Frontend --> AdminPages[Admin Console]
  Frontend --> ChatbotWidget[Chatbot Widget]

  PublicPages --> VehicleListing[Vehicle Listing]
  PublicPages --> VehicleDetail[Vehicle Detail]
  CustomerPages --> BookingsUI[My Bookings / Payment / Reviews]
  ManagerPages --> VehicleManagerUI[Add/Edit Vehicles / Bookings / Earnings]
  AdminPages --> AdminOps[Users / Vehicles / KYC / Categories / Support]
  ChatbotWidget --> ChatbotRouter[backend/app/routers/chatbot.py]

  Backend --> Routers[API Routers]
  Routers --> AuthRouter[auth.py]
  Routers --> VehicleRouter[vehicles.py]
  Routers --> BookingRouter[bookings.py]
  Routers --> PaymentRouter[payments.py]
  Routers --> ManagerRouter[manager.py]
  Routers --> AdminRouter[admin.py]
  Routers --> SupportRouter[support.py]
  Routers --> ChatbotRouter

  Backend --> Services[Domain Services]
  Services --> Pricing[pricing.py]
  Services --> Availability[availability.py]
  Services --> BookingFlow[booking_flow.py]
  Services --> SuperManager[super_manager.py]

  BookingRouter --> Pricing
  BookingRouter --> Availability
  BookingRouter --> BookingFlow
  ChatbotRouter --> Pricing
  ChatbotRouter --> Availability
  ChatbotRouter --> BookingFlow
  ManagerRouter --> SuperManager

  Backend --> Models[SQLAlchemy Models]
  Models --> UserModel[user.py]
  Models --> VehicleModel[vehicle.py]
  Models --> BookingModel[booking.py]
  Models --> PaymentModel[payment.py]
  Models --> CategoryModel[vehicle_category.py]
  Models --> SupportModel[support.py]

  Backend --> Postgres[(PostgreSQL)]
  Backend --> Redis[(Redis)]
  Backend --> Mongo[(MongoDB)]
  Backend --> Celery[Celery Tasks]

  Models --> Postgres
  ChatbotRouter --> Redis
  Backend --> MongoModels[Mongo Models]
  MongoModels --> Mongo
  Celery --> EmailTasks[email_tasks.py]
  Celery --> MaintenanceTasks[maintenance_tasks.py]
```

## Key Flows

```mermaid
sequenceDiagram
  participant C as Customer
  participant FE as React Frontend
  participant API as FastAPI
  participant AV as Availability Service
  participant PR as Pricing Service
  participant DB as PostgreSQL

  C->>FE: Search/select vehicle
  FE->>API: Preview or create booking
  API->>AV: Check date conflicts
  AV->>DB: Read bookings/blocks
  API->>PR: Calculate fare, insurance, chauffeur, fees
  API->>DB: Save booking and payment record
  API-->>FE: Booking/payment details
```

```mermaid
sequenceDiagram
  participant C as Customer
  participant Bot as ChatbotWidget
  participant API as chatbot.py
  participant LLM as OpenRouter/Gemini
  participant Tools as Chatbot Tools
  participant DB as Data Stores

  C->>Bot: Natural language request
  Bot->>API: Message + conversation history
  API->>LLM: Prompt with SigFleet tool rules
  LLM-->>API: Tool call
  API->>Tools: Execute search/price/book/cancel
  Tools->>DB: Read/write real data
  API-->>Bot: Reply + structured card data
```

## Primary Modules

- `frontend/src/App.jsx`: route table and page wiring.
- `frontend/src/components/chatbot/ChatbotWidget.jsx`: customer chat UI and structured result cards.
- `backend/app/main.py`: FastAPI application setup.
- `backend/app/routers/*`: HTTP API surface.
- `backend/app/services/pricing.py`: shared booking price calculations.
- `backend/app/services/availability.py`: vehicle availability and overlap checks.
- `backend/app/services/booking_flow.py`: wallet, payment, booking helper flow.
- `backend/app/models/*`: database schema models.

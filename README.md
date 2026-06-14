# Xeno CRM Backend

Welcome to the **Xeno CRM Backend** repository. This project is the robust, high-performance API server that powers the Xeno CRM platform, handling everything from user authentication and data management to background job processing and AI integrations.

## 🚀 Tech Stack

This backend is built for speed, scalability, and developer experience using modern Node.js tools:

- **Framework:** [Hono](https://hono.dev/) (running on Node.js)
- **Language:** TypeScript
- **Database ORM:** Prisma
- **Database:** PostgreSQL (configured via Prisma)
- **Queue & Background Jobs:** BullMQ with Redis
- **Task Scheduling:** Node-cron
- **AI Integration:** Google Generative AI (Gemini)
- **Communications:** Nodemailer (Emails), Twilio (SMS)
- **Validation:** Zod
- **Authentication:** JWT & bcryptjs

## 📁 Project Structure

The codebase is organized into modular components:

```
├── prisma/                 # Database schema and seed scripts (schema.prisma, seed.ts)
├── src/                    # Source code
│   ├── ai/                 # Gemini AI integration logic
│   ├── lib/                # Shared utilities and Prisma client initialization
│   ├── middleware/         # Hono middleware (e.g., authentication, error handling)
│   ├── queues/             # BullMQ queue setup and workers
│   ├── routes/             # API route definitions (auth, customers, orders, campaigns, etc.)
│   ├── scheduler/          # Cron jobs for recurring tasks (e.g., monthly campaigns)
│   ├── services/           # Core business logic
│   ├── types/              # TypeScript type definitions
│   └── index.ts            # Application entry point and server setup
├── Dockerfile.dev          # Docker configuration for development
├── package.json            # Project dependencies and scripts
├── start.sh                # Startup script (pushes schema, seeds DB, starts server)
└── tsconfig.json           # TypeScript configuration
```

## ✨ Core Modules & Features

- **🔐 Authentication:** Secure JWT-based auth and password hashing using bcrypt.
- **👥 Customer & Order Management:** APIs for CRUD operations on customers, tracking orders, and managing carts.
- **🎯 Segmentation:** Dynamic customer segmentation based on behavior and history.
- **📢 Campaigns & Scheduling:** Create, schedule, and send campaigns (email/SMS). Uses BullMQ for reliable delivery and `node-cron` for recurring sends.
- **🤖 AI Agent:** Integration with Google's Gemini to assist with CRM operations and content generation.
- **🛒 Abandoned Cart Recovery:** Endpoints for tracking and following up on abandoned carts.
- **📈 Analytics & Tracking:** Comprehensive APIs for gathering platform insights and tracking user events.

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL database
- Redis server (for BullMQ)

### Installation

1. Clone the repository and navigate to the backend directory:
   ```bash
   cd xeno-crm-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment variables by creating a `.env` file (refer to the expected vars in the codebase, such as `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `TWILIO_*`, `SMTP_*`, etc.).

### Database Setup

Run Prisma commands to set up the database and seed it with initial data:

```bash
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts
```

*Note: The `start.sh` script automatically handles schema pushing and seeding if the database is empty.*

### Development Scripts

- `npm run dev`: Starts the server in watch mode using `tsx`.
- `npm run build`: Compiles TypeScript files into the `dist/` folder.
- `npm run start`: Runs the compiled JavaScript application.
- `npm run lint`: Analyzes code for issues.
- `npm run typecheck`: Validates TypeScript types without emitting files.

### Running the App Locally

To start the development server, run:

```bash
npm run dev
```

The API will run on `http://localhost:3000` (or your configured `PORT`).

### Running with Docker

For a containerized development environment, use the provided Dockerfile and startup script:

```bash
docker build -t xeno-crm-backend -f Dockerfile.dev .
docker run -p 3000:3000 --env-file .env xeno-crm-backend
```
*(Or use `docker compose up` if integrated with a larger stack).*

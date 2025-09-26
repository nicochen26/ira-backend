# IRA Backend API

IRA Investment Research Backend API service built with Node.js and Hono.

## Features

- RESTful API with Hono framework
- Built-in security headers and CORS support
- Request logging with Hono's built-in logger
- Environment configuration with dotenv
- Modular project structure
- ESLint code linting
- Jest testing framework with native Hono testing

## Project Structure

```
ira-backend/
├── src/
│   ├── app.js              # Main application entry point
│   ├── config/             # Configuration files
│   ├── controllers/        # Route controllers
│   ├── middleware/         # Custom middleware
│   ├── models/             # Data models
│   ├── routes/             # API routes
│   └── utils/              # Utility functions
├── tests/                  # Test files
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore rules
├── package.json          # Project dependencies and scripts
└── README.md             # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ira-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

### Running the Application

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### Testing

Run tests:
```bash
npm test
```

### Linting

Check code style:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
NODE_ENV=development
PORT=3000
```

## API Endpoints

Base URL: `http://localhost:3000/api`

### Health Check
- `GET /api/health` - Health check endpoint

## Development

### Adding New Routes

1. Create route file in `src/routes/`
2. Create controller in `src/controllers/`
3. Register route in `src/app.js`

### Adding Middleware

1. Create middleware in `src/middleware/`
2. Apply globally in `src/app.js` or to specific routes

## License

ISC
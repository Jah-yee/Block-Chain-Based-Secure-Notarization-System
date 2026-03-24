## Running the Backend Project with Docker

This backend is containerized using Docker and Docker Compose. Follow these steps to build and run the application:

### Requirements
- **Node.js Version:** The Dockerfile uses `node:18`. All dependencies are specified in `package.json` and `package-lock.json`.

### Environment Variables
- See `.env` and `docker-compose.yml` for configuration. Database credentials are set in `docker-compose.yml`.

### Build and Run Instructions
1. **Build and start the application:**
   ```sh
   docker-compose up --build
   ```
   This will build the Docker image and start the services defined in `docker-compose.yml`.

2. **Accessing the Application:**
   - The backend runs on port **5000**. Access it via `http://localhost:5000`.
   - pgAdmin runs on port **5050**. Access it via `http://localhost:5050`.

### Special Configuration
- The application uses a non-root user for security inside the container.
- The `uploads/` directory is included in the image but is empty by default.
- PostgreSQL and pgAdmin are included as services.

### Ports
- **5000:** Backend API
- **5432:** PostgreSQL
- **5050:** pgAdmin

---

*Update this section if you add environment variables, external services, or change port configurations.*

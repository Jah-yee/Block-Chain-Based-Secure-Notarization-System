# Backend Setup Steps & Issues Log

## Step-by-Step Commands & Actions

### 1. Project Initialization
- Commands:
  - `git init`
  - `npm init -y`
  - `md uploads`
  - Created `.gitignore` and `README.md`
- Issues: None

### 2. Install Core Dependencies
- Command:
  - `npm install express multer dotenv ethers bcrypt jsonwebtoken cors`
- Issues: None

### 3. Create Project Structure
- Command:
  - `mkdir src, src\routes, src\middleware, src\utils`
  - `ni src\app.js, src\routes\auth.js, src\routes\upload.js, src\middleware\auth.js, src\utils\db.js`
- Issues: None

### 4. Express Boilerplate
- Added code to `src/app.js` for Express server setup.
- Issue: Initial run failed due to empty route files. Fixed by adding minimal router exports to `auth.js` and `upload.js`.

### 5. PostgreSQL with Docker
- Created `docker-compose.yml` for Postgres service.
- Command:
  - `docker-compose up -d`
- Issue: Docker was not running. Fixed by starting Docker Desktop.
- Issue: Network/DNS error when pulling image. Fixed by checking internet and retrying.

### 6. Dockerfile for Backend
- Created `Dockerfile` and updated `docker-compose.yml` to add backend service.
- Command:
  - `docker-compose up -d --build`
- Issue: Port 5000 conflict with old container. Fixed by stopping/removing old container and running fresh build.

### 7. pgAdmin Setup
- Added `servers.json` and updated `docker-compose.yml` to mount it in pgAdmin.
- Command:
  - `docker-compose up -d --build`
- Issue: pgAdmin not loading. Fixed by checking container status and logs.

### 8. Database Connection
- Added `db.js` and updated `app.js` for Postgres connection.
- Issue: Missing `pg` package. Fixed by running `npm install pg` and rebuilding container.
- Issue: Password mismatch. Fixed by updating credentials in `docker-compose.yml` and resetting containers.

### 9. Migrations Setup
- Created `migrations/` folder and installed `node-pg-migrate`.
- Added migration scripts to `package.json` and created `migration.config.js`.
- Created and applied SQL migration files for `users`, `documents`, and `ntkr_transactions` tables.
- Issue: PowerShell does not support `<` for input redirection. Fixed by using `Get-Content ... | docker exec -i ...`.
- Verified tables with `docker exec -it bbsns_postgres psql -U bbsns_user -d bbsns_db -c "\dt"`.

## Summary
All backend setup steps, issues, and fixes are logged here for future reference and reproducibility.

# Database Information

This file contains the database credentials and connection details found in your environment configuration.

## Credentials (from `backend/.env`)

These are the credentials configured for your backend services.

- **Host:** `localhost`
- **Port:** `5433` (Note: This is non-standard, standard PostgreSQL port is 5432)
- **Database Name:** `notarydb`
- **Username:** `bbsns_user`
- **Password:** `bbsns_pass`

### Connection String
`postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb`

## Configuration Files

- **Environment File:** `backend/.env`
- **Knex Configuration:** `backend/knexfile.js` (Note: Knexfile might default to `bbsns_db` on port 5432 if `DATABASE_URL` is not set, but `.env` overrides this)

## Troubleshooting

If you cannot log in, check:
1. **Port**: Ensure you are connecting to port **5433**, not 5432.
2. **Docker**: If running via Docker, these credentials should match `docker-compose.yml`.
3. **Values**: Ensure environment variables are loaded correctly.


## Verification Script

You can run the existing check script to verify connectivity:
```bash
cd backend
node check_db.js
```

## How to Check the Database Step-by-Step

### Method 1: Using pgAdmin (Visual Interface)
Your environment includes a running pgAdmin container.

1.  **Open in Browser:** Go to `http://localhost:5050`
    *   *Note: Use port 5050, as it is on the same internal network as the database.*
2.  **Login to pgAdmin:**
    -   **Email:** `admin@admin.com`
    -   **Password:** `admin123`
3.  **Add Server:**
    -   Right-click "Servers" > Register > Server...
    -   **General Tab:** Name it `BBSNS Local`
    -   **Connection Tab:**
        -   **Host name/address:** `postgres`
        -   **Port:** `5432`
        -   **Maintenance database:** `notarydb`
        -   **Username:** `bbsns_user`
        -   **Password:** `bbsns_pass`
    -   Click **Save**.
4.  You can now browse Tables -> Schemas -> public -> Tables.
    -   Right-click a table (e.g., `users`) -> View/Edit Data -> All Rows.

### Method 2: Command Line Checks
We have repaired the check scripts in the `backend/` folder.

1.  **Check Tables:** `node check_db.js` (Lists all tables)
2.  **Check Wallet Nonces:** `node check_db_schema.js` (Inspects `wallet_nonces` table)
3.  **Check Users Table:** `node check_schema.js` (Inspects `users` table)


## 🚀 Local Setup Guide

Follow the steps below to run the project locally using Docker.

### 1. Clone the Repository

```bash
git clone https://github.com/gabrielle-jeco/personal-performance-app.git
cd personal-performance-app
```

### 2. Build and Run Containers

> Make sure **Docker Desktop** is already installed and running.

```bash
docker-compose up -d --build
```

### 3. Access the Application

Open your browser and go to:

**[http://localhost:8080](http://localhost:8080)**

---

## 🔐 Demo Login Credentials

All accounts below use the same password:

**Password:** `password`

**Available Users:**

* `anton_mgr`
* `surya_spv`
* `budi_crew`
* `deni_crew`

---

## 🛠 Troubleshooting

### Container fails with `vendor/autoload.php not found`

Run composer install inside the backend container:

```bash
docker compose exec backend composer install
```

### Error: `exec /entrypoint.sh: no such file or directory`

This is usually caused by **Windows CRLF line endings** in `entrypoint.sh`.

Fix with:

```bash
sed -i 's/\r$//' backend/docker/entrypoint.sh
```

Then rebuild:

```bash
docker compose up -d --build
```

### Port `8080` already in use

Change the frontend port in `docker-compose.yml`, for example:

```yaml
ports:
  - "8081:80"
```

Then reopen:
**[http://localhost:8081](http://localhost:8081)**

---

Happy coding! 🚀


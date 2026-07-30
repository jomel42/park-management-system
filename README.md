# 🏞️ Park Management System
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)


A complete web application for managing public parks, users, zones, reports, and administrative processes. The system includes role-based authentication, real-time communication, PDF report generation, and a modular architecture built with Node.js and Express.

---
## 🚀 Key Features

- Secure authentication with JWT
- Role-based access control
- Park and zone management
- PDF report generation
- Real-time notifications using Socket.IO
- Integrated chatbot
- MySQL relational database
- Modular backend architecture
## Overview

The Park Management System was developed to simplify the administration of public parks by providing tools for managing parks, zones, users, reports, and other administrative tasks through a secure and scalable web application.

---

## Features

- Secure authentication and authorization
- Role-based access control
- Park management
- Zone management
- User management
- Dashboard with statistics
- PDF report generation
- Integrated chatbot
- Real-time communication with Socket.IO
- MySQL database integration
- Modular project architecture

---

# Technologies

| Technology | Description |
|------------|-------------|
| Node.js | Backend runtime |
| Express.js | Web framework |
| MySQL | Relational database |
| Socket.IO | Real-time communication |
| JavaScript | Programming language |
| HTML5 | Frontend |
| CSS3 | Styling |
| Bootstrap | User Interface |
| JWT | Authentication |
| Nodemon | Development server |

---

# Application Preview

## Login

![Login](screenshots/01-login.png)

---

## Dashboard

![Dashboard](screenshots/02-dashboard.png)

---

## Park Management

![Parks](screenshots/03-parks.png)

---

## Zone Management

![Zones](screenshots/04-zones.png)

---

## User Management

![Users](screenshots/05-users.png)

---

## Reports

![Reports](screenshots/06-reports.png)

---

## Chatbot

![Chatbot](screenshots/07-chatbot.png)

---

# Project Structure

```
park-management-system
│
├── database/
├── docs/
├── public/
├── screenshots/
├── src/
│
├── .env.example
├── package.json
├── package-lock.json
├── index.html
└── README.md
```

---

# Authentication

The application implements secure authentication using:

- Login system
- Role-based authorization
- Middleware protection
- Session validation

---

# Database

The project uses **MySQL** as the primary relational database.

Main modules include:

- Users
- Parks
- Zones
- Reports

---

# Installation

Clone the repository

```bash
git clone https://github.com/jomel42/park-management-system.git
```

Go to the project folder

```bash
cd park-management-system
```

Install dependencies

```bash
npm install
```

Configure environment variables

```bash
cp .env.example .env
```

Run the project

```bash
npm run dev
```

---

# License

This project is licensed under the MIT License.

---

## Author

**Jomel Dario Sinani Orellana**

GitHub:

https://github.com/jomel42

# Brainstorming Privado (Ambiental)
**Sistema inteligente de apoyo al brainstorming con privacidad total (Local-First)**

Este proyecto implementa una aplicación web **100% client-side** que asiste sesiones de brainstorming **sin enviar datos a la nube**: transcribe audio en tiempo real, ofrece intervención “agéntica” basada en **Seis Sombreros para Pensar**, analiza esquemas dibujados en un **canvas** y permite consultar **PDFs locales** mediante un pipeline **RAG** ejecutado en el navegador. 

> Objetivo principal: digitalizar y potenciar sesiones presenciales de ideación en entornos sensibles (I+D/estratégicos) garantizando que **ningún byte** salga del equipo del usuario. 

---

## Funcionalidades
### 1) Transcripción privada (ASR)
### 2) Razonamiento agéntico (Seis Sombreros)
### 3) Multimodalidad (Canvas)
### 4) Memoria contextual (RAG local sobre PDFs)

---

## Requisitos
- **Node.js + npm** (recomendado Node 18+).
- Navegador moderno:
  - Ideal: Chrome/Edge con **WebGPU** habilitado.
  - Alternativa: fallback a WASM/CPU (más lento).
- Permiso de **micrófono** para transcripción.
- GPU decente ayuda, pero el sistema intenta funcionar también en equipos modestos (a costa de latencia). 

---

## Instalación y ejecución
```bash
# 1) Clona el repositorio
git clone https://github.com/yaizaromero/Ambiental.git
cd Ambiental

# 2) Instala dependencias
npm install

# 3) Modo desarrollo
npm run dev

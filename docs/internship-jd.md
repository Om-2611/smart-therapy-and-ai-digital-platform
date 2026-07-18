# Internship Openings — STAAD Therapy Platform

**Duration:** 2 Months | **Compensation:** Unpaid | **Mode:** Hybrid

Project STAAD is a collaborative tele-therapy platform that pairs therapists and clients in a clinically scaffolded video session — live transcription, AI-generated clinical insights, interactive therapy tools, and a risk-detection layer. We are building the next generation of mental-health technology for neurodevelopmental and pediatric therapy. Join a small, mission-driven team and contribute directly to a product that helps therapists serve their clients better.

---

## Open Positions

1. [AI Engineer Intern (×2) — RAG Systems](#1-ai-engineer-intern-×2--rag-systems)
2. [Data Engineer Intern (×1) — RAG Data Pipeline](#2-data-engineer-intern-×1--rag-data-pipeline)
3. [Frontend + UI/UX Design Intern (×1)](#3-frontend--uiux-design-intern-×1)

---

## 1. AI Engineer Intern (×2) — RAG Systems

### About the Role

STAAD's AI clinical co-pilot currently generates session insights from live transcripts. The next step is grounding those insights in each therapist's own uploaded study material and past session history using a **Retrieval-Augmented Generation (RAG)** pipeline. As an AI Intern you will help design, build, and deploy this RAG system — from embedding documents to serving grounded responses in production.

### What You Will Do

- Implement end-to-end RAG pipelines: document ingestion, chunking strategies, embedding, vector storage, and retrieval.
- Integrate the RAG layer with our existing AI analysis route .
- Evaluate retrieval quality using standard RAG metrics .
- Deploy and maintain the RAG service — containerisation, API exposure, and environment configuration on Vercel or a cloud provider.
- Explore hybrid retrieval (dense + sparse / BM25) and re-ranking to improve clinical relevance.
- Document your pipeline decisions, evaluation results, and deployment steps.

### What We're Looking For

**Required**
- Solid Python skills; comfortable working with REST APIs.
- Conceptual understanding of LLMs, embeddings, and semantic search.
- Familiarity with at least one vector database (Pinecone, Weaviate, Qdrant, Chroma, or similar).
- Ability to read and navigate an existing TypeScript/Next.js codebase.

**Nice to Have**
- Hands-on experience with LangChain, LlamaIndex, or a similar RAG framework.
- Experience calling the Anthropic (Claude) or OpenAI API.
- Exposure to Docker / containerised deployments.
- Prior project (academic or personal) involving RAG, semantic search, or knowledge retrieval.

### What You Will Learn

- Full RAG lifecycle from data to deployed endpoint.
- Working with clinical/sensitive data constraints (chunking strategy for therapy notes, PII considerations).
- Integrating AI pipelines into a live production Next.js application.
- Evaluation-driven iteration: measuring and improving retrieval and generation quality.

---

## 2. Data Engineer Intern (×1) — RAG Data Pipeline

### About the Role

A RAG system is only as good as the data that feeds it. STAAD therapists upload study material and the platform accumulates session transcripts. Before any of that can power meaningful retrieval, it needs to be **collected, cleaned, structured, and pipeline-ready**. As the Data Engineering Intern you will own the data layer that makes the RAG system work.

### What You Will Do

- Audit and catalogue existing data assets: therapist-uploaded documents, session notes, and transcript exports.
- Design and implement ingestion pipelines that pull structured and unstructured data from Firestore and file storage into a format suitable for embedding.
- Build cleaning and normalisation scripts: deduplication, PII scrubbing, noise removal, and schema standardisation.
- Define chunking rules and metadata schemas (document type, therapist ID, session ID, clinical category) that maximise retrieval relevance.
- Create data validation checks and pipeline monitoring so the AI team can trust what goes into the vector store.
- Collaborate with the AI interns to hand off processed data and iterate on schema changes.

### What We're Looking For

**Required**
- Python scripting for data processing (pandas, or similar).
- Understanding of structured and unstructured data handling (JSON, plain text, PDF).
- Ability to read API / database docs and write queries (Firestore or any NoSQL).

**Nice to Have**
- Experience with ETL pipelines or workflow orchestration (Airflow, Prefect, or even simple cron scripts).
- Familiarity with text preprocessing techniques (tokenisation, normalisation, PII detection).
- Basic knowledge of what RAG is and why data quality matters for retrieval.
- Exposure to Firebase / Firestore.

### What You Will Learn

- How to build data pipelines for AI/ML systems in a real product environment.
- The specific constraints of healthcare-adjacent data: consent, minimisation, and safe handling.
- End-to-end ownership of a data layer from raw source to indexed, production-ready embeddings.
- Collaboration patterns between data and AI engineering roles.

---

## 3. Frontend + UI/UX Design Intern (×1)

### About the Role

STAAD's therapy room and dashboard must feel calm, clear, and trustworthy — for both the therapist running a clinical session and the child or adult on the other side of the screen. As the Frontend + Design Intern you will own both the visual design and the implementation of new product surfaces, working directly in our Next.js + Tailwind CSS codebase.

### What You Will Do

- Design and implement new UI features across the therapist dashboard, session room, and client-facing flows.
- Translate product requirements into low-fidelity wireframes and high-fidelity Figma prototypes, then build them in code.
- Improve the visual consistency and accessibility of existing screens (spacing, colour, typography, interactive states).
- Build and refine interactive therapy module UIs — these are collaborative tools used live during sessions.
- Participate in design reviews and iterate based on team feedback.
- Ensure responsive behaviour across desktop and tablet viewports.

### What We're Looking For

**Required**
- Proficiency in React and TypeScript (or strong JavaScript with willingness to learn TypeScript).
- Experience with a utility-first CSS framework, preferably Tailwind CSS.
- Ability to produce clean, component-level UI designs (Figma or equivalent).
- Eye for clean, minimal, accessible design — particularly for healthcare or emotional contexts.

**Nice to Have**
- Experience with Next.js (App Router).
- Familiarity with component libraries (shadcn/ui, Radix UI, or similar).
- Interest in or exposure to UX for neurodiverse or child-facing products.
- Basic animation / micro-interaction experience (Framer Motion or CSS transitions).

### What You Will Learn

- Designing and building product UI in a live Next.js application used by real therapists.
- The discipline of designing for emotional and clinical contexts — where clarity and calm matter more than trend.
- Component-driven development: building reusable, accessible UI components.
- Collaborating with product and engineering in a fast-moving small-team environment.

---

## General Information

### Duration & Commitment
- **2 months**,.
- Work is **Hybrid**; we operate primarily in HITAM college timmings.

### Compensation
- This is an **unpaid internship**.
- Interns will receive a **certificate of completion** and a **letter of recommendation** based on performance.
- Direct mentorship from the founding team and real ownership of features shipped to production.


---

*STAAD is building technology that makes therapy more effective for the people who need it most. Whatever your role, your work here will reach real therapists and real patients.*

# Inventory Tracker Architecture

## System Overview

A multi-user inventory management system with interactive 2D blueprint visualization.

```mermaid
flowchart TB
    subgraph Frontend["Frontend (TanStack Start)"]
        Router["React Router"]
        Auth["Stack Auth"]
        Konva["Konva Canvas"]
        Components["UI Components"]
        Queries["TanStack Query"]
    end
    
    subgraph Backend["Backend (Convex)"]
        Mutations["Mutations"]
        Queries["Queries"]
        Schema["Database Schema"]
        Realtime["Realtime Subscriptions"]
    end
    
    subgraph External["External Services"]
        Stack["Stack Auth"]
        ConvexCloud["Convex Cloud"]
    end
    
    Frontend -->|"Auth Requests"| Stack
    Frontend -->|"API Calls"| ConvexCloud
    Backend -->|"Data Storage"| ConvexCloud
```

## Database Schema

```mermaid
erDiagram
    ORGANIZATIONS {
        string _id PK
        string name
        string slug
        timestamp createdAt
    }
    
    USERS {
        string _id PK
        string stackAuthUserId
        string name
        string email
        string orgId FK
        string role
        timestamp createdAt
    }
    
    PARTS {
        string _id PK
        string name
        string sku
        string category
        string description
        string imageId
        boolean archived
        string orgId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    BLUEPRINTS {
        string _id PK
        string name
        string orgId FK
        string lockedBy FK
        timestamp lockTimestamp
        timestamp createdAt
        timestamp updatedAt
    }
    
    DRAWERS {
        string _id PK
        string blueprintId FK
        number x
        number y
        number width
        number height
        number rotation
        number zIndex
        string label
        timestamp createdAt
        timestamp updatedAt
    }
    
    COMPARTMENTS {
        string _id PK
        string drawerId FK
        number x
        number y
        number width
        number height
        number rotation
        number zIndex
        string label
        timestamp createdAt
        timestamp updatedAt
    }
    
    INVENTORY {
        string _id PK
        string partId FK
        string compartmentId FK
        number quantity
        string orgId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    TRANSACTIONS {
        string _id PK
        string actionType
        number quantityDelta
        string sourceCompartmentId FK
        string destCompartmentId FK
        string partId FK
        string userId FK
        timestamp timestamp
        string notes
        string orgId FK
    }
    
    ORGANIZATIONS ||--o{ USERS : contains
    ORGANIZATIONS ||--o{ PARTS : owns
    ORGANIZATIONS ||--o{ BLUEPRINTS : has
    ORGANIZATIONS ||--o{ INVENTORY : tracks
    ORGANIZATIONS ||--o{ TRANSACTIONS : records
    BLUEPRINTS ||--o{ DRAWERS : contains
    DRAWERS ||--o{ COMPARTMENTS : subdivides_into
    PARTS ||--o{ INVENTORY : stored_in
    COMPARTMENTS ||--o{ INVENTORY : holds
    USERS ||--o{ TRANSACTIONS : creates
```

## File Structure

```
/
├── convex/
│   ├── schema.ts           # Database schema definitions
│   ├── auth.ts             # Stack Auth integration
│   ├── auth_helpers.ts     # Authorization utilities
│   ├── http.ts             # HTTP actions (if needed)
│   ├── storage.ts          # File storage configuration
│   ├── users/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── parts/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── blueprints/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── drawers/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── compartments/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── inventory/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   └── transactions/
│       └── queries.ts
├── src/
│   ├── components/
│   │   ├── auth/
│   │   ├── blueprints/
│   │   ├── inventory/
│   │   ├── parts/
│   │   └── ui/
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useBlueprint.ts
│   │   └── useInventory.ts
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── convex.ts
│   │   └── utils.ts
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── dashboard.tsx
│   │   ├── parts/
│   │   ├── blueprints/
│   │   ├── inventory/
│   │   └── transactions/
│   └── types/
│       └── index.ts
└── plans/
    └── architecture.md
```

## Authorization Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant S as Stack Auth
    participant C as Convex
    participant DB as Database
    
    U->>F: Visit app
    F->>S: Check session
    alt Not authenticated
        S-->>F: Redirect to login
        U->>S: Login credentials
        S-->>F: Auth token + user info
        F->>C: syncUser(userInfo)
        C->>DB: upsert user record
    end
    F->>C: API calls with auth context
    C->>C: validateOrgAccess(ctx)
    C->>DB: Query/mutate data
    DB-->>C: Results
    C-->>F: Response
```

## Role-Based Permissions

| Feature | Admin | Editor | Viewer |
|---------|-------|--------|--------|
| View Blueprints | ✅ | ✅ | ✅ |
| Edit Blueprints | ✅ | ✅ | ❌ |
| Create Parts | ✅ | ✅ | ❌ |
| Edit Parts | ✅ | ✅ | ❌ |
| Archive Parts | ✅ | ✅ | ❌ |
| Check-in/out | ✅ | ✅ | ❌ |
| Move Parts | ✅ | ✅ | ❌ |
| Adjust Quantity | ✅ | ❌ | ❌ |
| View Transactions | ✅ | ✅ | ✅ |

## Key Technical Decisions

1. **Organization-scoped data**: All data filtered by orgId at query level
2. **Immutable transactions**: Transaction records cannot be modified or deleted
3. **Blueprint locking**: Only one user can edit a blueprint at a time
4. **Server-side validation**: All mutations validate permissions and data integrity
5. **Realtime updates**: Convex subscriptions for live collaboration
6. **Canvas coordinates**: Store geometry in blueprint coordinate system, transform for display

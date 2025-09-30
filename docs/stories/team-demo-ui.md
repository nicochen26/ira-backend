# Team Demo UI - Brownfield Addition

**Story ID:** STORY-TEAM-DEMO-001
**Type:** Enhancement
**Priority:** Medium
**Estimated Effort:** 2-3 hours

---

## User Story

As a **product demo viewer**,
I want **a web interface to demonstrate team collaboration features**,
So that **I can showcase how multiple users can share search history within a team context**.

---

## Story Context

### Existing System Integration

- **Integrates with:**
  - Existing `/web/index.html` debug interface
  - Team Management APIs (`/api/teams/*`)
  - Search APIs (`/api/search/*`, `/api/search/team/:teamId`)
  - Authentication API (`/api/auth/generate-token`)

- **Technology:** Vanilla JavaScript, HTML/CSS (matching existing debug UI style)

- **Follows pattern:** Existing debug interface pattern with sections, tabs, and real-time updates

- **Touch points:**
  - Team management endpoints (create team, add/remove members)
  - Search history endpoints (personal and team views)
  - Token generation and management
  - User switching with localStorage

---

## Acceptance Criteria

### Functional Requirements

#### 1. User Switcher Component
- Display 3 predefined demo users (Alice, Bob, Carol) with visual indicators
- Each user button shows:
  - User name
  - User email
  - Visual indicator for active user
- Click to switch active user:
  - Generates/loads token via `/api/auth/generate-token`
  - Updates localStorage with current user context
  - Refreshes all UI components (teams, search history)
  - Shows loading state during token generation

#### 2. Team Management Panel
- **Create Team Section:**
  - Input field for team name
  - "Create Team" button calling `POST /api/teams`
  - Success/error feedback messages

- **My Teams Display:**
  - List all teams for current user via `GET /api/teams`
  - For each team, show:
    - Team name and description
    - Members list via `GET /api/teams/:teamId/members`
    - "Add Member" button with dropdown selector
    - "Remove Member" button for each member

- **Team Member Management:**
  - Add member: `POST /api/teams/:teamId/members` with `userIdToAdd` from demo users
  - Remove member: `DELETE /api/teams/:teamId/members/:userId`
  - Show current user's role in each team
  - Disable operations based on permissions

#### 3. Search History with Team View
- **Tab Switcher:**
  - "Personal History" tab (default)
  - "Team History" tab

- **Personal History View:**
  - Shows current user's searches via `GET /api/search/history`
  - Uses existing search history display component
  - No changes to existing functionality

- **Team History View:**
  - Dropdown to select from user's teams
  - Shows all team members' searches via `GET /api/search/team/:teamId`
  - Displays search query, user name, created date, result count
  - Same visual styling as personal history

### Integration Requirements

4. Existing search streaming functionality continues to work unchanged
5. New team UI follows existing debug interface styling patterns (same card-based layout, color scheme, button styles)
6. All API integrations use existing endpoints without modifications
7. Token authentication works correctly for all three demo users

### Quality Requirements

8. All team operations properly handle authentication with switched user tokens
9. UI updates immediately when switching users or teams (no stale data)
10. Error messages display clearly for failed operations (network errors, permission denied, etc.)
11. No regression in existing search streaming and history functionality
12. Loading states show for all async operations

---

## Technical Notes

### Integration Approach

**UI Structure:**
```html
<!-- Add after auth-section in index.html -->
<div class="section user-switcher-section">
  <h2>👥 Demo Users</h2>
  <div class="user-switcher">
    <!-- 3 user buttons -->
  </div>
</div>

<div class="section team-management-section">
  <h2>🏢 Team Management</h2>
  <div class="team-create-form">...</div>
  <div class="team-list">...</div>
</div>

<!-- Modify existing search history section -->
<div class="section">
  <h2>📋 Search History</h2>
  <div class="history-tabs">
    <button id="personalTab">Personal</button>
    <button id="teamTab">Team</button>
  </div>
  <div id="personalHistory">...</div>
  <div id="teamHistory" style="display:none;">
    <select id="teamSelector"></select>
    <div id="teamHistoryList"></div>
  </div>
</div>
```

**JavaScript Implementation:**
- Extend existing `IRADebugInterface` class with:
  - `demoUsers` array with predefined users
  - `switchUser(userId)` method
  - `loadTeams()` method
  - `createTeam(name)` method
  - `addTeamMember(teamId, userId)` method
  - `removeTeamMember(teamId, userId)` method
  - `loadTeamHistory(teamId)` method
  - `renderTeamHistory(searches)` method

**Demo Users Configuration:**
```javascript
const demoUsers = [
  {
    id: 'demo-alice',
    name: 'Alice',
    email: 'alice@demo.local',
    color: '#3498db',
    icon: '👩‍💼'
  },
  {
    id: 'demo-bob',
    name: 'Bob',
    email: 'bob@demo.local',
    color: '#2ecc71',
    icon: '👨‍💻'
  },
  {
    id: 'demo-carol',
    name: 'Carol',
    email: 'carol@demo.local',
    color: '#e74c3c',
    icon: '👩‍🔬'
  }
];
```

### Existing Pattern Reference

- Follow `web/index.html` structure:
  - White card sections with rounded corners
  - Blue primary buttons (`background: #3498db`)
  - Status indicators with colored dots
  - Responsive grid layout

- Reuse existing utility methods:
  - `showStatus(message, type)` for feedback
  - `updateConnectionStatus(status)` for loading states
  - Error handling patterns with try-catch and user-friendly messages

### API Endpoints (All Existing)

| Endpoint | Method | Purpose | Request Body |
|----------|--------|---------|--------------|
| `/api/auth/generate-token` | POST | Generate token for demo user | `{ userId, email, name }` |
| `/api/teams` | GET | Get user's teams | - |
| `/api/teams` | POST | Create new team | `{ name, description? }` |
| `/api/teams/:teamId/members` | GET | Get team members | - |
| `/api/teams/:teamId/members` | POST | Add team member | `{ userIdToAdd, role? }` |
| `/api/teams/:teamId/members/:userId` | DELETE | Remove team member | - |
| `/api/search/history` | GET | Personal search history | Query: `limit`, `offset` |
| `/api/search/team/:teamId` | GET | Team search history | Query: `limit`, `page`, `sort` |

### Key Constraints

- Must use ONLY exposed public APIs (no direct database access)
- Must maintain existing debug interface functionality
- Demo users are created on-demand via token generation
- Token management uses localStorage with keys: `demoUser_${userId}_token`
- Current active user stored in localStorage: `currentDemoUser`

---

## Definition of Done

- [ ] User switcher displays 3 demo users with visual indicators
- [ ] Clicking user button generates token and switches context
- [ ] Team creation works for all demo users
- [ ] Adding members to team works (selecting from demo users)
- [ ] Removing members from team works
- [ ] Team list displays correctly for each user
- [ ] Personal history tab shows current user's searches
- [ ] Team history tab shows selected team's searches
- [ ] All existing search functionality works unchanged
- [ ] Code follows existing HTML/JS/CSS patterns in `index.html`
- [ ] Error handling displays clear messages
- [ ] Loading states show during API calls
- [ ] Manual testing with all 3 users switching verified
- [ ] No console errors during normal operation

---

## Risk and Compatibility Check

### Minimal Risk Assessment

**Primary Risk:** User switching might cause auth token conflicts or show stale data

**Mitigation:**
- Clear token management in localStorage with unique keys per user
- Force refresh of all data displays when switching users
- Show loading indicators during transitions

**Rollback:**
- Features are purely additive in UI
- Can be disabled by adding `display: none` to new sections
- No database changes required

### Compatibility Verification

- [x] No breaking changes to existing APIs
- [x] No database schema changes needed
- [x] UI changes follow existing design patterns
- [x] Performance impact negligible (local state switching + API calls)
- [x] No changes to existing search streaming logic

---

## Testing Scenarios

### Happy Path

1. **User Switching:**
   - Load page → Click "Alice" → Token generated → Alice's data loads
   - Click "Bob" → Token generated → Bob's data loads
   - Return to "Alice" → Uses cached token → Alice's data loads

2. **Team Management:**
   - Alice creates "Research Team" → Success
   - Alice adds Bob to team → Bob appears in members list
   - Switch to Bob → Bob sees "Research Team" in his teams
   - Bob performs search → Search appears in team history
   - Alice removes Bob → Bob no longer in members list

3. **Team History:**
   - Alice creates team and adds Bob, Carol
   - All three users perform searches
   - Alice switches to Team History tab
   - Selects "Research Team" → Sees all 3 users' searches with user names

### Error Scenarios

1. **Network Failures:**
   - API timeout → Show error message "Failed to load teams"
   - Invalid token → Redirect to token generation

2. **Permission Errors:**
   - Non-owner tries to remove member → Show "Access denied"
   - User tries to view non-member team → Show "Not a team member"

3. **Validation Errors:**
   - Empty team name → Show "Team name is required"
   - Adding same member twice → Show error from API

---

## Implementation Notes

### CSS Additions Needed

```css
.user-switcher {
    display: flex;
    gap: 10px;
    margin: 15px 0;
}

.user-button {
    padding: 12px 20px;
    border: 2px solid #e1e8ed;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
}

.user-button.active {
    border-color: #3498db;
    background: #e3f2fd;
}

.team-card {
    border: 1px solid #e1e8ed;
    border-radius: 6px;
    padding: 15px;
    margin: 10px 0;
}

.member-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0;
}

.member-badge {
    padding: 6px 12px;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 13px;
}

.history-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 15px;
    border-bottom: 2px solid #e1e8ed;
}

.history-tabs button {
    padding: 10px 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-bottom: 2px solid transparent;
}

.history-tabs button.active {
    border-bottom-color: #3498db;
    color: #3498db;
}
```

---

## Success Criteria

The story is complete when:

1. ✅ Demo can switch between 3 users seamlessly
2. ✅ Teams can be created and managed from UI
3. ✅ Team members can be added/removed
4. ✅ Search history displays in both personal and team contexts
5. ✅ All operations work with proper authentication
6. ✅ Existing functionality remains unchanged
7. ✅ UI is intuitive and follows existing design patterns

---

## Notes

- This enhancement is purely for demonstration purposes
- No production user management is implemented
- Focus is on showcasing team collaboration features
- Keep UI simple and functional, matching existing debug interface aesthetic
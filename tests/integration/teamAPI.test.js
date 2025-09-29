const app = require('../../src/app');
const userService = require('../../src/services/userService');
const dbClient = require('../../src/db/client');
const jwt = require('jsonwebtoken');

describe('Team API Integration Tests', () => {
  let testUsers = [];
  let authTokens = [];

  beforeAll(async () => {
    await dbClient.connect();
  });

  afterAll(async () => {
    await dbClient.disconnect();
  });

  beforeEach(async () => {
    const prisma = dbClient.getClient();

    // Clean up test data
    await prisma.teamMember.deleteMany({
      where: {
        OR: [
          { team: { name: { contains: 'API Test' } } },
          { user: { email: { contains: 'apitest' } } }
        ]
      }
    });

    await prisma.team.deleteMany({
      where: { name: { contains: 'API Test' } }
    });

    await prisma.user.deleteMany({
      where: { email: { contains: 'apitest' } }
    });

    // Create test users
    testUsers = [
      await userService.createUser({ name: 'API Owner', email: 'owner@apitest.com' }),
      await userService.createUser({ name: 'API Admin', email: 'admin@apitest.com' }),
      await userService.createUser({ name: 'API Member', email: 'member@apitest.com' }),
      await userService.createUser({ name: 'API External', email: 'external@apitest.com' })
    ];

    // Create auth tokens for each user
    authTokens = testUsers.map(user =>
      jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      )
    );
  });

  describe('POST /api/teams', () => {
    test('should create team successfully', async () => {
      const teamData = {
        name: 'API Test Team',
        description: 'Created via API test'
      };

      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(teamData)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(teamData.name);
      expect(data.data.description).toBe(teamData.description);
      expect(data.data.ownerId).toBe(testUsers[0].id);
    });

    test('should fail without authentication', async () => {
      const teamData = { name: 'Unauthorized Team' };

      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamData)
      });

      expect(response.status).toBe(401);
    });

    test('should fail with invalid team data', async () => {
      const teamData = { description: 'Missing name' };

      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(teamData)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Team name is required');
    });
  });

  describe('GET /api/teams', () => {
    let testTeam;

    beforeEach(async () => {
      // Create a test team
      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify({
          name: 'Get Teams Test',
          description: 'For testing get teams'
        })
      });
      const data = await response.json();
      testTeam = data.data;
    });

    test('should get user teams successfully', async () => {
      const response = await app.request('/api/teams', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.data[0].id).toBe(testTeam.id);
      expect(data.data[0].userRole).toBe('owner');
    });

    test('should return empty array for user with no teams', async () => {
      const response = await app.request('/api/teams', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[3]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    test('should fail without authentication', async () => {
      const response = await app.request('/api/teams', {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/teams/:teamId', () => {
    let testTeam;

    beforeEach(async () => {
      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify({
          name: 'Get Single Team Test',
          description: 'For testing get single team'
        })
      });
      const data = await response.json();
      testTeam = data.data;
    });

    test('should get team by ID for team member', async () => {
      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testTeam.id);
      expect(data.data.name).toBe('Get Single Team Test');
      expect(data.data.members).toBeDefined();
    });

    test('should fail for non-member', async () => {
      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[3]}`
        }
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should fail for non-existent team', async () => {
      const response = await app.request('/api/teams/non-existent-id', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/teams/:teamId', () => {
    let testTeam;

    beforeEach(async () => {
      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify({
          name: 'Update Team Test',
          description: 'For testing team updates'
        })
      });
      const data = await response.json();
      testTeam = data.data;
    });

    test('should update team successfully', async () => {
      const updateData = {
        name: 'Updated Team Name',
        description: 'Updated description'
      };

      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify(updateData)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updateData.name);
      expect(data.data.description).toBe(updateData.description);
    });

    test('should fail for non-member', async () => {
      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[3]}`
        },
        body: JSON.stringify({ name: 'Unauthorized Update' })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/teams/:teamId', () => {
    let testTeam;

    beforeEach(async () => {
      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify({
          name: 'Delete Team Test',
          description: 'For testing team deletion'
        })
      });
      const data = await response.json();
      testTeam = data.data;
    });

    test('should delete team successfully by owner', async () => {
      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authTokens[0]}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.deletedTeamId).toBe(testTeam.id);
    });

    test('should fail for non-owner', async () => {
      const response = await app.request(`/api/teams/${testTeam.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authTokens[1]}`
        }
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Team Member Management', () => {
    let testTeam;

    beforeEach(async () => {
      const response = await app.request('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokens[0]}`
        },
        body: JSON.stringify({
          name: 'Member Management Test',
          description: 'For testing member management'
        })
      });
      const data = await response.json();
      testTeam = data.data;
    });

    describe('GET /api/teams/:teamId/members', () => {
      test('should get team members', async () => {
        const response = await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authTokens[0]}`
          }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.data.length).toBe(1);
        expect(data.data[0].role).toBe('owner');
      });

      test('should fail for non-member', async () => {
        const response = await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authTokens[3]}`
          }
        });

        expect(response.status).toBe(403);
      });
    });

    describe('POST /api/teams/:teamId/members', () => {
      test('should add member successfully', async () => {
        const memberData = {
          userIdToAdd: testUsers[1].id,
          role: 'admin'
        };

        const response = await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify(memberData)
        });

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.userId).toBe(testUsers[1].id);
        expect(data.data.role).toBe('admin');
      });

      test('should fail to add non-existent user', async () => {
        const memberData = {
          userIdToAdd: 'non-existent-user',
          role: 'member'
        };

        const response = await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify(memberData)
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.success).toBe(false);
      });
    });

    describe('DELETE /api/teams/:teamId/members/:userId', () => {
      beforeEach(async () => {
        // Add a member first
        await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify({
            userIdToAdd: testUsers[1].id,
            role: 'admin'
          })
        });
      });

      test('should remove member successfully', async () => {
        const response = await app.request(`/api/teams/${testTeam.id}/members/${testUsers[1].id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authTokens[0]}`
          }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.removedUserId).toBe(testUsers[1].id);
      });

      test('should allow self-removal', async () => {
        const response = await app.request(`/api/teams/${testTeam.id}/members/${testUsers[1].id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authTokens[1]}`
          }
        });

        expect(response.status).toBe(200);
      });
    });

    describe('PUT /api/teams/:teamId/members/:userId/role', () => {
      beforeEach(async () => {
        // Add a member first
        await app.request(`/api/teams/${testTeam.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify({
            userIdToAdd: testUsers[1].id,
            role: 'member'
          })
        });
      });

      test('should update member role successfully', async () => {
        const roleData = { role: 'admin' };

        const response = await app.request(`/api/teams/${testTeam.id}/members/${testUsers[1].id}/role`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify(roleData)
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.role).toBe('admin');
      });

      test('should fail for non-owner', async () => {
        const roleData = { role: 'admin' };

        const response = await app.request(`/api/teams/${testTeam.id}/members/${testUsers[1].id}/role`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[1]}`
          },
          body: JSON.stringify(roleData)
        });

        expect(response.status).toBe(400);
      });

      test('should transfer ownership', async () => {
        const roleData = { role: 'owner' };

        const response = await app.request(`/api/teams/${testTeam.id}/members/${testUsers[1].id}/role`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokens[0]}`
          },
          body: JSON.stringify(roleData)
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.role).toBe('owner');
      });
    });
  });
});
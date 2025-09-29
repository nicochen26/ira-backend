const { teamService, TeamNotFoundError, TeamAccessDeniedError, TeamValidationError } = require('../../src/services/teamService');
const userService = require('../../src/services/userService');
const dbClient = require('../../src/db/client');

describe('Team Service', () => {
  let testUsers = [];

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
          { team: { name: { contains: 'Test' } } },
          { user: { email: { contains: 'teamtest' } } }
        ]
      }
    });

    await prisma.team.deleteMany({
      where: { name: { contains: 'Test' } }
    });

    await prisma.user.deleteMany({
      where: { email: { contains: 'teamtest' } }
    });

    // Create test users
    testUsers = [
      await userService.createUser({ name: 'Team Owner', email: 'owner@teamtest.com' }),
      await userService.createUser({ name: 'Team Admin', email: 'admin@teamtest.com' }),
      await userService.createUser({ name: 'Team Member', email: 'member@teamtest.com' }),
      await userService.createUser({ name: 'External User', email: 'external@teamtest.com' })
    ];
  });

  describe('createTeam', () => {
    test('should create a team successfully', async () => {
      const teamData = {
        name: 'Test Team',
        description: 'A test team'
      };

      const team = await teamService.createTeam(teamData, testUsers[0].id);

      expect(team).toBeDefined();
      expect(team.id).toBeDefined();
      expect(team.name).toBe(teamData.name);
      expect(team.description).toBe(teamData.description);
      expect(team.ownerId).toBe(testUsers[0].id);
      expect(team.owner).toBeDefined();
      expect(team.owner.id).toBe(testUsers[0].id);
      expect(team.createdAt).toBeDefined();
    });

    test('should create team without description', async () => {
      const teamData = { name: 'Test Team No Desc' };

      const team = await teamService.createTeam(teamData, testUsers[0].id);

      expect(team.name).toBe(teamData.name);
      expect(team.description).toBeNull();
    });

    test('should throw error when name is missing', async () => {
      const teamData = { description: 'Missing name' };

      await expect(teamService.createTeam(teamData, testUsers[0].id))
        .rejects.toThrow('Team name is required');
    });

    test('should throw error when name is empty string', async () => {
      const teamData = { name: '   ', description: 'Empty name' };

      await expect(teamService.createTeam(teamData, testUsers[0].id))
        .rejects.toThrow('Team name is required');
    });

    test('should throw error when owner ID is missing', async () => {
      const teamData = { name: 'Test Team' };

      await expect(teamService.createTeam(teamData, null))
        .rejects.toThrow('Owner ID is required');
    });

    test('should throw error when owner does not exist', async () => {
      const teamData = { name: 'Test Team' };

      await expect(teamService.createTeam(teamData, 'non-existent-id'))
        .rejects.toThrow('Owner user not found');
    });

    test('should trim whitespace from name and description', async () => {
      const teamData = {
        name: '  Test Team With Spaces  ',
        description: '  Test description  '
      };

      const team = await teamService.createTeam(teamData, testUsers[0].id);

      expect(team.name).toBe('Test Team With Spaces');
      expect(team.description).toBe('Test description');
    });
  });

  describe('getTeamById', () => {
    let testTeam;

    beforeEach(async () => {
      testTeam = await teamService.createTeam(
        { name: 'Get Test Team', description: 'For getting' },
        testUsers[0].id
      );
    });

    test('should get team by ID for team member', async () => {
      const team = await teamService.getTeamById(testTeam.id, testUsers[0].id);

      expect(team).toBeDefined();
      expect(team.id).toBe(testTeam.id);
      expect(team.name).toBe('Get Test Team');
      expect(team.owner).toBeDefined();
      expect(team.members).toBeDefined();
      expect(team.members.length).toBe(1);
      expect(team.members[0].userId).toBe(testUsers[0].id);
      expect(team.members[0].role).toBe('owner');
    });

    test('should get team without userId validation when userId not provided', async () => {
      const team = await teamService.getTeamById(testTeam.id);

      expect(team).toBeDefined();
      expect(team.id).toBe(testTeam.id);
    });

    test('should throw error for non-existent team', async () => {
      await expect(teamService.getTeamById('non-existent-id', testUsers[0].id))
        .rejects.toThrow('Team not found');
    });

    test('should throw error when user is not a team member', async () => {
      await expect(teamService.getTeamById(testTeam.id, testUsers[3].id))
        .rejects.toThrow('You do not have access to view this team');
    });

    test('should throw error when team ID is missing', async () => {
      await expect(teamService.getTeamById(null, testUsers[0].id))
        .rejects.toThrow('Team ID is required');
    });
  });

  describe('updateTeam', () => {
    let testTeam;

    beforeEach(async () => {
      testTeam = await teamService.createTeam(
        { name: 'Update Test Team', description: 'For updating' },
        testUsers[0].id
      );
    });

    test('should update team name and description by owner', async () => {
      const updateData = {
        name: 'Updated Team Name',
        description: 'Updated description'
      };

      const updatedTeam = await teamService.updateTeam(testTeam.id, updateData, testUsers[0].id);

      expect(updatedTeam.name).toBe(updateData.name);
      expect(updatedTeam.description).toBe(updateData.description);
      expect(updatedTeam.id).toBe(testTeam.id);
    });

    test('should update only name', async () => {
      const updateData = { name: 'New Name Only' };

      const updatedTeam = await teamService.updateTeam(testTeam.id, updateData, testUsers[0].id);

      expect(updatedTeam.name).toBe(updateData.name);
      expect(updatedTeam.description).toBe('For updating');
    });

    test('should update only description', async () => {
      const updateData = { description: 'New description only' };

      const updatedTeam = await teamService.updateTeam(testTeam.id, updateData, testUsers[0].id);

      expect(updatedTeam.name).toBe('Update Test Team');
      expect(updatedTeam.description).toBe(updateData.description);
    });

    test('should clear description when set to empty string', async () => {
      const updateData = { description: '' };

      const updatedTeam = await teamService.updateTeam(testTeam.id, updateData, testUsers[0].id);

      expect(updatedTeam.description).toBeNull();
    });

    test('should throw error when team does not exist', async () => {
      await expect(teamService.updateTeam('non-existent-id', { name: 'New Name' }, testUsers[0].id))
        .rejects.toThrow('Team not found');
    });

    test('should throw error when user is not a team member', async () => {
      await expect(teamService.updateTeam(testTeam.id, { name: 'New Name' }, testUsers[3].id))
        .rejects.toThrow('You do not have permission to update this team');
    });

    test('should throw error when team name is empty', async () => {
      await expect(teamService.updateTeam(testTeam.id, { name: '   ' }, testUsers[0].id))
        .rejects.toThrow('Team name cannot be empty');
    });

    test('should throw error when no fields to update', async () => {
      await expect(teamService.updateTeam(testTeam.id, {}, testUsers[0].id))
        .rejects.toThrow('No valid fields to update');
    });

    test('should throw error when team ID is missing', async () => {
      await expect(teamService.updateTeam(null, { name: 'New Name' }, testUsers[0].id))
        .rejects.toThrow('Team ID is required');
    });

    test('should trim whitespace from updated fields', async () => {
      const updateData = {
        name: '  Trimmed Name  ',
        description: '  Trimmed Description  '
      };

      const updatedTeam = await teamService.updateTeam(testTeam.id, updateData, testUsers[0].id);

      expect(updatedTeam.name).toBe('Trimmed Name');
      expect(updatedTeam.description).toBe('Trimmed Description');
    });
  });

  describe('deleteTeam', () => {
    let testTeam;

    beforeEach(async () => {
      testTeam = await teamService.createTeam(
        { name: 'Delete Test Team', description: 'For deleting' },
        testUsers[0].id
      );
    });

    test('should delete team by owner', async () => {
      const result = await teamService.deleteTeam(testTeam.id, testUsers[0].id);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Team deleted successfully');
      expect(result.deletedTeamId).toBe(testTeam.id);
      expect(result.deletedMembersCount).toBe(1);

      // Verify team is deleted
      await expect(teamService.getTeamById(testTeam.id))
        .rejects.toThrow('Team not found');
    });

    test('should throw error when team does not exist', async () => {
      await expect(teamService.deleteTeam('non-existent-id', testUsers[0].id))
        .rejects.toThrow('Team not found');
    });

    test('should throw error when user is not the owner', async () => {
      await expect(teamService.deleteTeam(testTeam.id, testUsers[1].id))
        .rejects.toThrow('Only team owner can delete the team');
    });

    test('should throw error when team ID is missing', async () => {
      await expect(teamService.deleteTeam(null, testUsers[0].id))
        .rejects.toThrow('Team ID is required');
    });
  });

  describe('getUserTeams', () => {
    beforeEach(async () => {
      // Create multiple teams with different roles for the user
      const team1 = await teamService.createTeam(
        { name: 'User Teams Test 1', description: 'Owner team' },
        testUsers[0].id
      );

      const team2 = await teamService.createTeam(
        { name: 'User Teams Test 2', description: 'Other owner team' },
        testUsers[1].id
      );

      // Add testUsers[0] as admin to team2
      const prisma = dbClient.getClient();
      await prisma.teamMember.create({
        data: {
          teamId: team2.id,
          userId: testUsers[0].id,
          role: 'admin'
        }
      });
    });

    test('should get all teams for a user', async () => {
      const userTeams = await teamService.getUserTeams(testUsers[0].id);

      expect(userTeams).toBeDefined();
      expect(userTeams.length).toBe(2);

      const ownerTeam = userTeams.find(t => t.name === 'User Teams Test 1');
      const adminTeam = userTeams.find(t => t.name === 'User Teams Test 2');

      expect(ownerTeam).toBeDefined();
      expect(ownerTeam.userRole).toBe('owner');
      expect(ownerTeam.memberCount).toBe(1);

      expect(adminTeam).toBeDefined();
      expect(adminTeam.userRole).toBe('admin');
      expect(adminTeam.memberCount).toBe(2);
    });

    test('should return empty array for user with no teams', async () => {
      const userTeams = await teamService.getUserTeams(testUsers[3].id);

      expect(userTeams).toBeDefined();
      expect(userTeams.length).toBe(0);
    });

    test('should throw error when user ID is missing', async () => {
      await expect(teamService.getUserTeams(null))
        .rejects.toThrow('User ID is required');
    });

    test('should include correct team metadata', async () => {
      const userTeams = await teamService.getUserTeams(testUsers[0].id);
      const team = userTeams[0];

      expect(team).toHaveProperty('id');
      expect(team).toHaveProperty('name');
      expect(team).toHaveProperty('description');
      expect(team).toHaveProperty('createdAt');
      expect(team).toHaveProperty('updatedAt');
      expect(team).toHaveProperty('owner');
      expect(team).toHaveProperty('memberCount');
      expect(team).toHaveProperty('userRole');
      expect(team).toHaveProperty('userJoinedAt');
    });
  });
});
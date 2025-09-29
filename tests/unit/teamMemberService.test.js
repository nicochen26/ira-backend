const { teamMemberService, TeamMemberNotFoundError, TeamMemberAccessDeniedError, TeamMemberValidationError } = require('../../src/services/teamMemberService');
const { teamService } = require('../../src/services/teamService');
const userService = require('../../src/services/userService');
const dbClient = require('../../src/db/client');

describe('Team Member Service', () => {
  let testUsers = [];
  let testTeam;

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
          { team: { name: { contains: 'Member Test' } } },
          { user: { email: { contains: 'membertest' } } }
        ]
      }
    });

    await prisma.team.deleteMany({
      where: { name: { contains: 'Member Test' } }
    });

    await prisma.user.deleteMany({
      where: { email: { contains: 'membertest' } }
    });

    // Create test users
    testUsers = [
      await userService.createUser({ name: 'Team Owner', email: 'owner@membertest.com' }),
      await userService.createUser({ name: 'Team Admin', email: 'admin@membertest.com' }),
      await userService.createUser({ name: 'Team Member', email: 'member@membertest.com' }),
      await userService.createUser({ name: 'External User', email: 'external@membertest.com' }),
      await userService.createUser({ name: 'Another User', email: 'another@membertest.com' })
    ];

    // Create test team
    testTeam = await teamService.createTeam(
      { name: 'Member Test Team', description: 'For member testing' },
      testUsers[0].id
    );
  });

  describe('addMemberToTeam', () => {
    test('should add member by team owner', async () => {
      const newMember = await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id,
        'admin'
      );

      expect(newMember).toBeDefined();
      expect(newMember.userId).toBe(testUsers[1].id);
      expect(newMember.teamId).toBe(testTeam.id);
      expect(newMember.role).toBe('admin');
      expect(newMember.user).toBeDefined();
      expect(newMember.user.email).toBe('admin@membertest.com');
      expect(newMember.team).toBeDefined();
      expect(newMember.team.name).toBe('Member Test Team');
    });

    test('should add member with default role', async () => {
      const newMember = await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id
      );

      expect(newMember.role).toBe('member');
    });

    test('should allow admin to add members', async () => {
      // First add user as admin
      await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id,
        'admin'
      );

      // Then admin adds another member
      const newMember = await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[1].id,
        'member'
      );

      expect(newMember.userId).toBe(testUsers[2].id);
      expect(newMember.role).toBe('member');
    });

    test('should throw error when team does not exist', async () => {
      await expect(teamMemberService.addMemberToTeam(
        'non-existent-team',
        testUsers[1].id,
        testUsers[0].id
      )).rejects.toThrow('Team not found');
    });

    test('should throw error when user to add does not exist', async () => {
      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        'non-existent-user',
        testUsers[0].id
      )).rejects.toThrow('User to add not found');
    });

    test('should throw error when requester is not team member', async () => {
      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[3].id
      )).rejects.toThrow('You do not have permission to add members to this team');
    });

    test('should throw error when member is not admin or owner', async () => {
      // Add user as regular member first
      await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id,
        'member'
      );

      // Member tries to add another user
      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[1].id
      )).rejects.toThrow('You do not have permission to add members to this team');
    });

    test('should throw error when user is already a member', async () => {
      await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id
      );

      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id
      )).rejects.toThrow('User is already a member of this team');
    });

    test('should throw error when admin tries to assign owner role', async () => {
      // Add user as admin first
      await teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id,
        'admin'
      );

      // Admin tries to make someone owner
      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[1].id,
        'owner'
      )).rejects.toThrow('Only team owner can assign owner or admin roles');
    });

    test('should throw error with invalid role', async () => {
      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[0].id,
        'invalid-role'
      )).rejects.toThrow('Invalid role. Must be owner, admin, or member');
    });

    test('should throw error with missing required parameters', async () => {
      await expect(teamMemberService.addMemberToTeam(
        null,
        testUsers[1].id,
        testUsers[0].id
      )).rejects.toThrow('Team ID, user ID, and requester ID are required');

      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        null,
        testUsers[0].id
      )).rejects.toThrow('Team ID, user ID, and requester ID are required');

      await expect(teamMemberService.addMemberToTeam(
        testTeam.id,
        testUsers[1].id,
        null
      )).rejects.toThrow('Team ID, user ID, and requester ID are required');
    });
  });

  describe('removeMemberFromTeam', () => {
    beforeEach(async () => {
      // Add some members to the team
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[1].id, testUsers[0].id, 'admin');
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[2].id, testUsers[0].id, 'member');
    });

    test('should allow owner to remove member', async () => {
      const result = await teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[0].id
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Member removed successfully');
      expect(result.teamId).toBe(testTeam.id);
      expect(result.removedUserId).toBe(testUsers[2].id);
    });

    test('should allow admin to remove regular member', async () => {
      const result = await teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[1].id
      );

      expect(result.success).toBe(true);
    });

    test('should allow self-removal', async () => {
      const result = await teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[2].id,
        testUsers[2].id
      );

      expect(result.success).toBe(true);
    });

    test('should throw error when team does not exist', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        'non-existent-team',
        testUsers[1].id,
        testUsers[0].id
      )).rejects.toThrow('Team not found');
    });

    test('should throw error when user is not a member', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[3].id,
        testUsers[0].id
      )).rejects.toThrow('User is not a member of this team');
    });

    test('should throw error when member tries to remove others', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[1].id,
        testUsers[2].id
      )).rejects.toThrow('You do not have permission to remove this member');
    });

    test('should throw error when admin tries to remove owner', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[0].id,
        testUsers[1].id
      )).rejects.toThrow('Team owner cannot be removed by others');
    });

    test('should throw error when owner is removed by others', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[0].id,
        testUsers[1].id
      )).rejects.toThrow('Team owner cannot be removed by others');
    });

    test('should throw error when last owner tries to remove themselves', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[0].id,
        testUsers[0].id
      )).rejects.toThrow('Cannot remove the last owner. Transfer ownership or delete the team instead');
    });

    test('should allow owner self-removal when there are other owners', async () => {
      // Make another user owner first
      await teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[1].id,
        'owner',
        testUsers[0].id
      );

      // Now the former owner (now admin) can remove themselves
      const result = await teamMemberService.removeMemberFromTeam(
        testTeam.id,
        testUsers[0].id, // Original owner removing themselves (now they're admin)
        testUsers[0].id
      );

      expect(result.success).toBe(true);
    });

    test('should throw error with missing required parameters', async () => {
      await expect(teamMemberService.removeMemberFromTeam(
        null,
        testUsers[1].id,
        testUsers[0].id
      )).rejects.toThrow('Team ID, user ID to remove, and requester ID are required');
    });
  });

  describe('getTeamMembers', () => {
    beforeEach(async () => {
      // Add some members to the team
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[1].id, testUsers[0].id, 'admin');
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[2].id, testUsers[0].id, 'member');
    });

    test('should get team members for team member', async () => {
      const members = await teamMemberService.getTeamMembers(testTeam.id, testUsers[0].id);

      expect(members).toBeDefined();
      expect(members.length).toBe(3);

      const owner = members.find(m => m.role === 'owner');
      const admin = members.find(m => m.role === 'admin');
      const member = members.find(m => m.role === 'member');

      expect(owner).toBeDefined();
      expect(owner.userId).toBe(testUsers[0].id);
      expect(owner.name).toBe('Team Owner');

      expect(admin).toBeDefined();
      expect(admin.userId).toBe(testUsers[1].id);
      expect(admin.name).toBe('Team Admin');

      expect(member).toBeDefined();
      expect(member.userId).toBe(testUsers[2].id);
      expect(member.name).toBe('Team Member');
    });

    test('should throw error when user is not a team member', async () => {
      await expect(teamMemberService.getTeamMembers(testTeam.id, testUsers[3].id))
        .rejects.toThrow('You do not have access to view team members');
    });

    test('should throw error with missing required parameters', async () => {
      await expect(teamMemberService.getTeamMembers(null, testUsers[0].id))
        .rejects.toThrow('Team ID and requester ID are required');

      await expect(teamMemberService.getTeamMembers(testTeam.id, null))
        .rejects.toThrow('Team ID and requester ID are required');
    });

    test('should return members with correct structure', async () => {
      const members = await teamMemberService.getTeamMembers(testTeam.id, testUsers[0].id);
      const member = members[0];

      expect(member).toHaveProperty('id');
      expect(member).toHaveProperty('userId');
      expect(member).toHaveProperty('name');
      expect(member).toHaveProperty('email');
      expect(member).toHaveProperty('role');
      expect(member).toHaveProperty('joinedAt');
    });
  });

  describe('updateMemberRole', () => {
    beforeEach(async () => {
      // Add some members to the team
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[1].id, testUsers[0].id, 'admin');
      await teamMemberService.addMemberToTeam(testTeam.id, testUsers[2].id, testUsers[0].id, 'member');
    });

    test('should update member role by owner', async () => {
      const updatedMember = await teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[2].id,
        'admin',
        testUsers[0].id
      );

      expect(updatedMember.role).toBe('admin');
      expect(updatedMember.userId).toBe(testUsers[2].id);
    });

    test('should transfer ownership', async () => {
      const updatedMember = await teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[1].id,
        'owner',
        testUsers[0].id
      );

      expect(updatedMember.role).toBe('owner');

      // Verify old owner is now admin
      const members = await teamMemberService.getTeamMembers(testTeam.id, testUsers[1].id);
      const oldOwner = members.find(m => m.userId === testUsers[0].id);
      expect(oldOwner.role).toBe('admin');
    });

    test('should throw error when team does not exist', async () => {
      await expect(teamMemberService.updateMemberRole(
        'non-existent-team',
        testUsers[1].id,
        'admin',
        testUsers[0].id
      )).rejects.toThrow('Team not found');
    });

    test('should throw error when user to update is not a member', async () => {
      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[3].id,
        'admin',
        testUsers[0].id
      )).rejects.toThrow('User is not a member of this team');
    });

    test('should throw error when requester is not owner', async () => {
      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[2].id,
        'admin',
        testUsers[1].id
      )).rejects.toThrow('Only team owner can change member roles');
    });

    test('should throw error when owner tries to change own role (except ownership transfer)', async () => {
      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[0].id,
        'admin',
        testUsers[0].id
      )).rejects.toThrow('You cannot change your own role except to transfer ownership');
    });

    test('should allow ownership transfer to self', async () => {
      const updatedMember = await teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[0].id,
        'owner',
        testUsers[0].id
      );

      expect(updatedMember.role).toBe('owner');
    });

    test('should throw error with invalid role', async () => {
      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[1].id,
        'invalid-role',
        testUsers[0].id
      )).rejects.toThrow('Invalid role. Must be owner, admin, or member');
    });

    test('should throw error with missing required parameters', async () => {
      await expect(teamMemberService.updateMemberRole(
        null,
        testUsers[1].id,
        'admin',
        testUsers[0].id
      )).rejects.toThrow('All parameters are required');

      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        null,
        'admin',
        testUsers[0].id
      )).rejects.toThrow('All parameters are required');

      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[1].id,
        null,
        testUsers[0].id
      )).rejects.toThrow('All parameters are required');

      await expect(teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[1].id,
        'admin',
        null
      )).rejects.toThrow('All parameters are required');
    });

    test('should return updated member with correct structure', async () => {
      const updatedMember = await teamMemberService.updateMemberRole(
        testTeam.id,
        testUsers[2].id,
        'admin',
        testUsers[0].id
      );

      expect(updatedMember).toHaveProperty('id');
      expect(updatedMember).toHaveProperty('userId');
      expect(updatedMember).toHaveProperty('name');
      expect(updatedMember).toHaveProperty('email');
      expect(updatedMember).toHaveProperty('role');
      expect(updatedMember).toHaveProperty('joinedAt');
    });
  });
});
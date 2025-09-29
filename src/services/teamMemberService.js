const dbClient = require('../db/client');

class TeamMemberNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamMemberNotFoundError';
  }
}

class TeamMemberAccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamMemberAccessDeniedError';
  }
}

class TeamMemberValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamMemberValidationError';
  }
}

const teamMemberService = {
  /**
   * Add a member to a team
   * @param {string} teamId - Team ID
   * @param {string} userIdToAdd - User ID to add to team
   * @param {string} requesterId - User ID making the request
   * @param {string} role - Role to assign (default: 'member')
   * @returns {Promise<Object>} Added team member
   */
  async addMemberToTeam(teamId, userIdToAdd, requesterId, role = 'member') {
    const prisma = dbClient.getClient();

    // Validate inputs
    if (!teamId || !userIdToAdd || !requesterId) {
      throw new TeamMemberValidationError('Team ID, user ID, and requester ID are required');
    }

    if (!['owner', 'admin', 'member'].includes(role)) {
      throw new TeamMemberValidationError('Invalid role. Must be owner, admin, or member');
    }

    // Get team and check permissions
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: { userId: requesterId }
        }
      }
    });

    if (!team) {
      throw new TeamMemberNotFoundError('Team not found');
    }

    // Check if requester has permission to add members (owner or admin)
    const requesterMember = team.members[0];
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      throw new TeamMemberAccessDeniedError('You do not have permission to add members to this team');
    }

    // Verify user to add exists
    const userToAdd = await prisma.user.findUnique({
      where: { id: userIdToAdd }
    });

    if (!userToAdd) {
      throw new TeamMemberValidationError('User to add not found');
    }

    // Check if user is already a member
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: teamId,
          userId: userIdToAdd
        }
      }
    });

    if (existingMember) {
      throw new TeamMemberValidationError('User is already a member of this team');
    }

    // Only owner can assign owner or admin roles
    if (['owner', 'admin'].includes(role) && requesterMember.role !== 'owner') {
      throw new TeamMemberAccessDeniedError('Only team owner can assign owner or admin roles');
    }

    // Add member
    const newMember = await prisma.teamMember.create({
      data: {
        teamId: teamId,
        userId: userIdToAdd,
        role: role
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        team: {
          select: { id: true, name: true }
        }
      }
    });

    return newMember;
  },

  /**
   * Remove a member from a team
   * @param {string} teamId - Team ID
   * @param {string} userIdToRemove - User ID to remove from team
   * @param {string} requesterId - User ID making the request
   * @returns {Promise<Object>} Removal confirmation
   */
  async removeMemberFromTeam(teamId, userIdToRemove, requesterId) {
    const prisma = dbClient.getClient();

    // Validate inputs
    if (!teamId || !userIdToRemove || !requesterId) {
      throw new TeamMemberValidationError('Team ID, user ID to remove, and requester ID are required');
    }

    // Get team and member information
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: {
            OR: [
              { userId: requesterId },
              { userId: userIdToRemove }
            ]
          }
        }
      }
    });

    if (!team) {
      throw new TeamMemberNotFoundError('Team not found');
    }

    const requesterMember = team.members.find(m => m.userId === requesterId);
    const memberToRemove = team.members.find(m => m.userId === userIdToRemove);

    if (!memberToRemove) {
      throw new TeamMemberNotFoundError('User is not a member of this team');
    }

    // Check permissions
    const isSelfRemoval = requesterId === userIdToRemove;
    const requesterCanRemove = requesterMember && ['owner', 'admin'].includes(requesterMember.role);

    if (!isSelfRemoval && !requesterCanRemove) {
      throw new TeamMemberAccessDeniedError('You do not have permission to remove this member');
    }

    // Owner cannot be removed by others, and owner cannot remove themselves if they're the only owner
    if (memberToRemove.role === 'owner') {
      if (!isSelfRemoval) {
        throw new TeamMemberAccessDeniedError('Team owner cannot be removed by others');
      }

      // Check if there are other owners
      const ownerCount = await prisma.teamMember.count({
        where: {
          teamId: teamId,
          role: 'owner'
        }
      });

      if (ownerCount === 1) {
        throw new TeamMemberAccessDeniedError('Cannot remove the last owner. Transfer ownership or delete the team instead');
      }
    }

    // Admin cannot remove owner
    if (memberToRemove.role === 'owner' && requesterMember?.role === 'admin') {
      throw new TeamMemberAccessDeniedError('Admin cannot remove team owner');
    }

    // Remove member
    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId: teamId,
          userId: userIdToRemove
        }
      }
    });

    return {
      success: true,
      message: 'Member removed successfully',
      teamId: teamId,
      removedUserId: userIdToRemove
    };
  },

  /**
   * Get team members
   * @param {string} teamId - Team ID
   * @param {string} requesterId - User ID making the request
   * @returns {Promise<Array>} List of team members
   */
  async getTeamMembers(teamId, requesterId) {
    const prisma = dbClient.getClient();

    if (!teamId || !requesterId) {
      throw new TeamMemberValidationError('Team ID and requester ID are required');
    }

    // Check if requester is a member of the team
    const requesterMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: teamId,
          userId: requesterId
        }
      }
    });

    if (!requesterMember) {
      throw new TeamMemberAccessDeniedError('You do not have access to view team members');
    }

    // Get all team members
    const members = await prisma.teamMember.findMany({
      where: { teamId: teamId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: [
        { role: 'asc' }, // owners first, then admins, then members
        { joinedAt: 'asc' }
      ]
    });

    return members.map(member => ({
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.joinedAt
    }));
  },

  /**
   * Update member role
   * @param {string} teamId - Team ID
   * @param {string} userIdToUpdate - User ID whose role to update
   * @param {string} newRole - New role to assign
   * @param {string} requesterId - User ID making the request
   * @returns {Promise<Object>} Updated team member
   */
  async updateMemberRole(teamId, userIdToUpdate, newRole, requesterId) {
    const prisma = dbClient.getClient();

    // Validate inputs
    if (!teamId || !userIdToUpdate || !newRole || !requesterId) {
      throw new TeamMemberValidationError('All parameters are required');
    }

    if (!['owner', 'admin', 'member'].includes(newRole)) {
      throw new TeamMemberValidationError('Invalid role. Must be owner, admin, or member');
    }

    // Get team and member information
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: {
            OR: [
              { userId: requesterId },
              { userId: userIdToUpdate }
            ]
          }
        }
      }
    });

    if (!team) {
      throw new TeamMemberNotFoundError('Team not found');
    }

    const requesterMember = team.members.find(m => m.userId === requesterId);
    const memberToUpdate = team.members.find(m => m.userId === userIdToUpdate);

    if (!requesterMember) {
      throw new TeamMemberAccessDeniedError('You are not a member of this team');
    }

    if (!memberToUpdate) {
      throw new TeamMemberNotFoundError('User is not a member of this team');
    }

    // Only owner can change roles
    if (requesterMember.role !== 'owner') {
      throw new TeamMemberAccessDeniedError('Only team owner can change member roles');
    }

    // Cannot change your own role unless transferring ownership
    if (requesterId === userIdToUpdate && newRole !== 'owner') {
      throw new TeamMemberAccessDeniedError('You cannot change your own role except to transfer ownership');
    }

    // If assigning owner role, demote current owner to admin
    if (newRole === 'owner' && memberToUpdate.role !== 'owner') {
      await prisma.$transaction(async (tx) => {
        // Demote current owner to admin
        await tx.teamMember.update({
          where: {
            teamId_userId: {
              teamId: teamId,
              userId: requesterId
            }
          },
          data: { role: 'admin' }
        });

        // Update team owner
        await tx.team.update({
          where: { id: teamId },
          data: { ownerId: userIdToUpdate }
        });

        // Promote new owner
        await tx.teamMember.update({
          where: {
            teamId_userId: {
              teamId: teamId,
              userId: userIdToUpdate
            }
          },
          data: { role: 'owner' }
        });
      });
    } else {
      // Regular role update
      await prisma.teamMember.update({
        where: {
          teamId_userId: {
            teamId: teamId,
            userId: userIdToUpdate
          }
        },
        data: { role: newRole }
      });
    }

    // Return updated member
    const updatedMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: teamId,
          userId: userIdToUpdate
        }
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return {
      id: updatedMember.id,
      userId: updatedMember.user.id,
      name: updatedMember.user.name,
      email: updatedMember.user.email,
      role: updatedMember.role,
      joinedAt: updatedMember.joinedAt
    };
  }
};

module.exports = {
  teamMemberService,
  TeamMemberNotFoundError,
  TeamMemberAccessDeniedError,
  TeamMemberValidationError
};
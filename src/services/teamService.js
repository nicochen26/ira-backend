const dbClient = require('../db/client');

class TeamNotFoundError extends Error {
  constructor(teamId) {
    super(`Team not found: ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

class TeamAccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamAccessDeniedError';
  }
}

class TeamValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamValidationError';
  }
}

const teamService = {
  /**
   * Create a new team with the specified user as owner
   * @param {Object} teamData - Team creation data
   * @param {string} teamData.name - Team name
   * @param {string} teamData.description - Team description (optional)
   * @param {string} ownerId - User ID who will own the team
   * @returns {Promise<Object>} Created team with owner details
   */
  async createTeam(teamData, ownerId) {
    const prisma = dbClient.getClient();

    // Validate required fields
    if (!teamData.name || !teamData.name.trim()) {
      throw new TeamValidationError('Team name is required');
    }

    if (!ownerId) {
      throw new TeamValidationError('Owner ID is required');
    }

    // Verify owner exists
    const owner = await prisma.user.findUnique({
      where: { id: ownerId }
    });

    if (!owner) {
      throw new TeamValidationError('Owner user not found');
    }

    try {
      // Create team and add owner as member in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the team
        const team = await tx.team.create({
          data: {
            name: teamData.name.trim(),
            description: teamData.description?.trim() || null,
            ownerId: ownerId
          },
          include: {
            owner: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        // Add owner as a team member with "owner" role
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId: ownerId,
            role: 'owner'
          }
        });

        return team;
      });

      return result;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new TeamValidationError('Team name already exists');
      }
      throw error;
    }
  },

  /**
   * Get team by ID with member details
   * @param {string} teamId - Team ID
   * @param {string} userId - User ID requesting the team (for access check)
   * @returns {Promise<Object>} Team with members
   */
  async getTeamById(teamId, userId) {
    const prisma = dbClient.getClient();

    if (!teamId) {
      throw new TeamValidationError('Team ID is required');
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    // Check if user has access to view this team
    if (userId) {
      const isMember = team.members.some(member => member.userId === userId);
      if (!isMember) {
        throw new TeamAccessDeniedError('You do not have access to view this team');
      }
    }

    return team;
  },

  /**
   * Update team details
   * @param {string} teamId - Team ID
   * @param {Object} updateData - Data to update
   * @param {string} userId - User ID making the update
   * @returns {Promise<Object>} Updated team
   */
  async updateTeam(teamId, updateData, userId) {
    const prisma = dbClient.getClient();

    if (!teamId) {
      throw new TeamValidationError('Team ID is required');
    }

    // Get team and check permissions
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: { userId: userId }
        }
      }
    });

    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    // Check if user has permission to update (owner or admin)
    const userMember = team.members[0];
    if (!userMember || !['owner', 'admin'].includes(userMember.role)) {
      throw new TeamAccessDeniedError('You do not have permission to update this team');
    }

    // Validate update data
    const updateFields = {};
    if (updateData.name !== undefined) {
      if (!updateData.name || !updateData.name.trim()) {
        throw new TeamValidationError('Team name cannot be empty');
      }
      updateFields.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      updateFields.description = updateData.description?.trim() || null;
    }

    if (Object.keys(updateFields).length === 0) {
      throw new TeamValidationError('No valid fields to update');
    }

    try {
      const updatedTeam = await prisma.team.update({
        where: { id: teamId },
        data: updateFields,
        include: {
          owner: {
            select: { id: true, name: true, email: true }
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { joinedAt: 'asc' }
          }
        }
      });

      return updatedTeam;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new TeamValidationError('Team name already exists');
      }
      throw error;
    }
  },

  /**
   * Delete team (owner only)
   * @param {string} teamId - Team ID
   * @param {string} userId - User ID requesting deletion
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteTeam(teamId, userId) {
    const prisma = dbClient.getClient();

    if (!teamId) {
      throw new TeamValidationError('Team ID is required');
    }

    // Get team and check ownership
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true
      }
    });

    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    // Only owner can delete team
    if (team.ownerId !== userId) {
      throw new TeamAccessDeniedError('Only team owner can delete the team');
    }

    // Delete team (members will be deleted automatically due to cascade)
    await prisma.team.delete({
      where: { id: teamId }
    });

    return {
      success: true,
      message: 'Team deleted successfully',
      deletedTeamId: teamId,
      deletedMembersCount: team.members.length
    };
  },

  /**
   * Get teams for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of teams the user belongs to
   */
  async getUserTeams(userId) {
    const prisma = dbClient.getClient();

    if (!userId) {
      throw new TeamValidationError('User ID is required');
    }

    const teams = await prisma.team.findMany({
      where: {
        members: {
          some: {
            userId: userId
          }
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          where: { userId: userId },
          select: { role: true, joinedAt: true }
        },
        _count: {
          select: { members: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Flatten the user's role into the team object
    return teams.map(team => ({
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
      owner: team.owner,
      memberCount: team._count.members,
      userRole: team.members[0]?.role,
      userJoinedAt: team.members[0]?.joinedAt
    }));
  }
};

module.exports = {
  teamService,
  TeamNotFoundError,
  TeamAccessDeniedError,
  TeamValidationError
};
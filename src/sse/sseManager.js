const { EventEmitter } = require('events');

class SSEConnection extends EventEmitter {
  constructor(searchId, userId, response) {
    super();
    this.id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.searchId = searchId;
    this.userId = userId;
    this.response = response;
    this.connected = true;
    this.lastActivity = Date.now();

    // Handle different response types (Node.js response vs stream controller)
    if (response.writeHead) {
      // Standard Node.js response
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      });

      response.on('close', () => {
        this.connected = false;
        this.emit('disconnect', this.id);
      });

      response.on('error', (error) => {
        this.connected = false;
        console.error(`SSE connection error for search ${searchId}:`, error);
        this.emit('error', error);
      });
    }

    // Send initial connection event
    this.sendEvent('connected', { searchId, timestamp: new Date().toISOString() });

    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.sendHeartbeat();
      } else {
        clearInterval(this.heartbeatInterval);
      }
    }, 30000);
  }

  sendEvent(type, data, id = null) {
    if (!this.connected) return false;

    try {
      let eventData = '';
      if (id) {
        eventData += `id: ${id}\n`;
      }
      eventData += `event: ${type}\n`;
      eventData += `data: ${JSON.stringify(data)}\n\n`;

      // Handle different response types
      if (this.response.write) {
        // Standard Node.js response
        this.response.write(eventData);
      } else if (this.response.write && typeof this.response.write === 'function') {
        // Custom write function (stream controller)
        this.response.write(eventData);
      } else {
        // Fallback
        console.warn('Unknown response type for SSE connection');
        return false;
      }

      this.lastActivity = Date.now();
      return true;
    } catch (error) {
      console.error('Failed to send SSE event:', error);
      this.connected = false;
      return false;
    }
  }

  sendHeartbeat() {
    this.sendEvent('heartbeat', { timestamp: new Date().toISOString() });
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.connected && this.response) {
      this.sendEvent('disconnect', { message: 'Connection closed by server' });
      this.response.end();
    }
    this.connected = false;
  }
}

class SSEManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.connections = new Map(); // searchId -> Set<SSEConnection>
    this.userConnections = new Map(); // userId -> Set<SSEConnection>
    this.maxConnections = options.maxConnections || 1000;
    this.connectionTimeout = options.connectionTimeout || 30 * 60 * 1000; // 30 minutes

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000); // Every minute

    process.on('exit', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }

  addConnection(searchId, userId, response) {
    // Check connection limits
    const totalConnections = Array.from(this.connections.values())
      .reduce((total, set) => total + set.size, 0);

    if (totalConnections >= this.maxConnections) {
      throw new Error('Maximum SSE connections exceeded');
    }

    const connection = new SSEConnection(searchId, userId, response);

    // Add to searchId connections
    if (!this.connections.has(searchId)) {
      this.connections.set(searchId, new Set());
    }
    this.connections.get(searchId).add(connection);

    // Add to user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(connection);

    // Handle connection events
    connection.on('disconnect', () => {
      this.removeConnection(connection);
    });

    connection.on('error', (error) => {
      console.error(`SSE connection error:`, error);
      this.removeConnection(connection);
    });

    this.emit('connectionAdded', connection);
    console.log(`SSE connection added for search ${searchId}, user ${userId}. Total connections: ${totalConnections + 1}`);

    return connection;
  }

  removeConnection(connection) {
    const { searchId, userId, id } = connection;

    // Remove from search connections
    const searchConnections = this.connections.get(searchId);
    if (searchConnections) {
      searchConnections.delete(connection);
      if (searchConnections.size === 0) {
        this.connections.delete(searchId);
      }
    }

    // Remove from user connections
    const userConns = this.userConnections.get(userId);
    if (userConns) {
      userConns.delete(connection);
      if (userConns.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    // Close the connection
    connection.close();

    const totalConnections = Array.from(this.connections.values())
      .reduce((total, set) => total + set.size, 0);

    this.emit('connectionRemoved', connection);
    console.log(`SSE connection removed for search ${searchId}, user ${userId}. Total connections: ${totalConnections}`);
  }

  broadcastToSearch(searchId, eventType, data, eventId = null) {
    const connections = this.connections.get(searchId);
    if (!connections || connections.size === 0) {
      console.log(`[SSE] No connections found for search ${searchId}, event: ${eventType}`);
      return 0;
    }

    console.log(`[SSE] Broadcasting to ${connections.size} connection(s) for search ${searchId}, event: ${eventType}`);

    let successCount = 0;
    const failedConnections = [];

    connections.forEach(connection => {
      if (connection.sendEvent(eventType, data, eventId)) {
        successCount++;
      } else {
        failedConnections.push(connection);
      }
    });

    // Clean up failed connections
    failedConnections.forEach(conn => this.removeConnection(conn));

    console.log(`[SSE] Broadcast completed: ${successCount}/${connections.size} successful`);

    return successCount;
  }

  broadcastToUser(userId, eventType, data, eventId = null) {
    const connections = this.userConnections.get(userId);
    if (!connections || connections.size === 0) {
      return 0;
    }

    let successCount = 0;
    const failedConnections = [];

    connections.forEach(connection => {
      if (connection.sendEvent(eventType, data, eventId)) {
        successCount++;
      } else {
        failedConnections.push(connection);
      }
    });

    // Clean up failed connections
    failedConnections.forEach(conn => this.removeConnection(conn));

    return successCount;
  }

  getSearchConnectionCount(searchId) {
    const connections = this.connections.get(searchId);
    return connections ? connections.size : 0;
  }

  getUserConnectionCount(userId) {
    const connections = this.userConnections.get(userId);
    return connections ? connections.size : 0;
  }

  getTotalConnectionCount() {
    return Array.from(this.connections.values())
      .reduce((total, set) => total + set.size, 0);
  }

  cleanupStaleConnections() {
    const now = Date.now();
    const staleConnections = [];

    this.connections.forEach(searchConnections => {
      searchConnections.forEach(connection => {
        if (now - connection.lastActivity > this.connectionTimeout) {
          staleConnections.push(connection);
        }
      });
    });

    staleConnections.forEach(connection => {
      console.log(`Cleaning up stale SSE connection: ${connection.id}`);
      this.removeConnection(connection);
    });

    if (staleConnections.length > 0) {
      console.log(`Cleaned up ${staleConnections.length} stale SSE connections`);
    }
  }

  cleanup() {
    console.log('Cleaning up SSE Manager...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections gracefully
    this.connections.forEach(searchConnections => {
      searchConnections.forEach(connection => {
        connection.close();
      });
    });

    this.connections.clear();
    this.userConnections.clear();

    console.log('SSE Manager cleanup completed');
  }

  getStats() {
    return {
      totalConnections: this.getTotalConnectionCount(),
      searchCount: this.connections.size,
      userCount: this.userConnections.size,
      maxConnections: this.maxConnections,
      connectionTimeout: this.connectionTimeout
    };
  }
}

// Singleton instance
let sseManagerInstance = null;

const getSSeManager = () => {
  if (!sseManagerInstance) {
    sseManagerInstance = new SSEManager();
  }
  return sseManagerInstance;
};

module.exports = {
  SSEConnection,
  SSEManager,
  getSSeManager
};
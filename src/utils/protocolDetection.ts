/**
 * Protocol Detection Utility
 *
 * Detects the service type and protocol for network processes based on:
 * - Port number (common HTTP ports, game server ports, etc.)
 * - Process name and command patterns
 * - Known development server patterns
 */

export interface DetectedProtocol {
  service_type: string;  // "http", "minecraft", "tcp", "ssh", etc.
  protocol: string;      // "https", "tcp", "minecraft", etc.
}

/**
 * Common HTTP/HTTPS ports used by web servers
 */
const HTTP_PORTS = new Set([
  80,    // HTTP
  443,   // HTTPS
  3000,  // Common dev server (React, Express, etc.)
  3001,  // Common alt dev port
  4200,  // Angular CLI
  4321,  // Astro dev server
  5000,  // Flask default
  5173,  // Vite dev server
  8000,  // Common dev server (Django, Python HTTP, etc.)
  8080,  // Common HTTP alt port
  8081,  // Common HTTP alt port
  8888,  // Jupyter, alt HTTP
  9000,  // Common dev port
]);

/**
 * Detect protocol based on process information
 */
export function detectProtocol(
  port: number,
  processName: string,
  command: string
): DetectedProtocol {
  const lowerCommand = command.toLowerCase();
  const lowerName = processName.toLowerCase();

  // === HTTP/HTTPS DETECTION ===

  // Check common HTTP ports first
  if (HTTP_PORTS.has(port)) {
    return {
      service_type: 'http',
      protocol: 'https', // Use HTTPS by default for security
    };
  }

  // Check for common web server patterns in command
  const webServerPatterns = [
    'npm run dev',
    'npm run start',
    'npm start',
    'yarn dev',
    'yarn start',
    'vite',
    'webpack',
    'next dev',
    'next start',
    'react-scripts',
    'vue-cli',
    'angular',
    'ng serve',
    'manage.py runserver',  // Django
    'flask run',            // Flask
    'uvicorn',              // FastAPI/Uvicorn
    'fastapi',
    'gunicorn',
    'python -m http.server',
    'python -m SimpleHTTPServer',
    'serve',                // npm serve
    'http-server',
    'express',
    'node server',
  ];

  for (const pattern of webServerPatterns) {
    if (lowerCommand.includes(pattern)) {
      return {
        service_type: 'http',
        protocol: 'https',
      };
    }
  }

  // Check process name for web servers
  const webServerNames = ['node', 'python', 'ruby', 'php', 'nginx', 'apache'];
  if (webServerNames.includes(lowerName) && port >= 3000 && port <= 9000) {
    return {
      service_type: 'http',
      protocol: 'https',
    };
  }

  // === MINECRAFT DETECTION ===

  const minecraftPorts = new Set([25565, 25566, 25567, 25575]); // Default + common variants
  if (minecraftPorts.has(port) ||
      lowerCommand.includes('server.jar') ||
      lowerCommand.includes('minecraft') ||
      lowerCommand.includes('spigot') ||
      lowerCommand.includes('bukkit') ||
      lowerCommand.includes('paper')) {
    return {
      service_type: 'minecraft',
      protocol: 'tcp',
    };
  }

  // === SSH DETECTION ===

  if (port === 22 || lowerCommand.includes('sshd') || lowerName === 'sshd') {
    return {
      service_type: 'ssh',
      protocol: 'tcp',
    };
  }

  // === DATABASE DETECTION ===

  const databasePatterns = [
    { port: 5432, name: 'postgres', service: 'postgresql' },
    { port: 3306, name: 'mysql', service: 'mysql' },
    { port: 6379, name: 'redis', service: 'redis' },
    { port: 27017, name: 'mongo', service: 'mongodb' },
  ];

  for (const db of databasePatterns) {
    if (port === db.port || lowerName.includes(db.name)) {
      return {
        service_type: db.service,
        protocol: 'tcp',
      };
    }
  }

  // === GAME SERVERS ===

  const gameServerPatterns = [
    { pattern: 'terraria', service: 'terraria', defaultPort: 7777 },
    { pattern: 'valheim', service: 'valheim', defaultPort: 2456 },
    { pattern: 'rust', service: 'rust', defaultPort: 28015 },
  ];

  for (const game of gameServerPatterns) {
    if (lowerCommand.includes(game.pattern) ||
        lowerName.includes(game.pattern) ||
        port === game.defaultPort) {
      return {
        service_type: game.service,
        protocol: 'tcp',
      };
    }
  }

  // === DEFAULT: TCP ===

  // If we can't detect anything specific, default to TCP
  return {
    service_type: 'tcp',
    protocol: 'tcp',
  };
}

/**
 * Get a human-readable description of the detected service
 */
export function getServiceDescription(serviceType: string): string {
  const descriptions: Record<string, string> = {
    http: 'Web Server',
    minecraft: 'Minecraft Server',
    ssh: 'SSH Server',
    postgresql: 'PostgreSQL Database',
    mysql: 'MySQL Database',
    redis: 'Redis Database',
    mongodb: 'MongoDB Database',
    terraria: 'Terraria Server',
    valheim: 'Valheim Server',
    rust: 'Rust Server',
    tcp: 'TCP Service',
  };

  return descriptions[serviceType] || 'Unknown Service';
}

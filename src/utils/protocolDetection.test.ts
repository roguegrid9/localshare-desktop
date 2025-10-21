import { describe, it, expect } from 'vitest';
import { detectProtocol, getServiceDescription } from './protocolDetection';

describe('Protocol Detection', () => {
  describe('detectProtocol', () => {
    it('detects HTTP server on common port 3000', () => {
      const result = detectProtocol(3000, 'node', 'node server.js');

      expect(result.service_type).toBe('http');
      expect(result.protocol).toBe('https');
    });

    it('detects HTTP server from npm run dev command', () => {
      const result = detectProtocol(4000, 'node', 'npm run dev');

      expect(result.service_type).toBe('http');
      expect(result.protocol).toBe('https');
    });

    it('detects MongoDB database on port 27017', () => {
      const result = detectProtocol(27017, 'mongod', '/usr/bin/mongod');

      expect(result.service_type).toBe('mongodb');
      expect(result.protocol).toBe('tcp');
    });

    it('detects SSH server on port 22', () => {
      const result = detectProtocol(22, 'sshd', '/usr/sbin/sshd');

      expect(result.service_type).toBe('ssh');
      expect(result.protocol).toBe('tcp');
    });

    it('detects PostgreSQL database on port 5432', () => {
      const result = detectProtocol(5432, 'postgres', '/usr/bin/postgres');

      expect(result.service_type).toBe('postgresql');
      expect(result.protocol).toBe('tcp');
    });

    it('detects MySQL database on port 3306', () => {
      const result = detectProtocol(3306, 'mysqld', '/usr/sbin/mysqld');

      expect(result.service_type).toBe('mysql');
      expect(result.protocol).toBe('tcp');
    });

    it('defaults to TCP for unknown port and process', () => {
      const result = detectProtocol(12345, 'unknown', 'unknown-process');

      expect(result.service_type).toBe('tcp');
      expect(result.protocol).toBe('tcp');
    });
  });

  describe('getServiceDescription', () => {
    it('returns Web Server for http service type', () => {
      expect(getServiceDescription('http')).toBe('Web Server');
    });

    it('returns Minecraft Server for minecraft service type', () => {
      expect(getServiceDescription('minecraft')).toBe('Minecraft Server');
    });

    it('returns PostgreSQL Database for postgresql service type', () => {
      expect(getServiceDescription('postgresql')).toBe('PostgreSQL Database');
    });

    it('returns TCP Service for tcp service type', () => {
      expect(getServiceDescription('tcp')).toBe('TCP Service');
    });

    it('returns Unknown Service for unrecognized service type', () => {
      expect(getServiceDescription('invalid-service')).toBe('Unknown Service');
    });
  });
});

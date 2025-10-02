// API client for RogueGrid9 coordinator server

// For Tauri apps, always use the production API
const API_BASE = 'https://roguegrid9-coordinator.fly.dev';

// Debug: Log API base URL on module load
console.log('🌐 API_BASE configured as:', API_BASE);

export interface CreateProcessShareRequest {
  subdomain: string;
  customName?: string;
  isPublic: boolean;
  requiresPassword: boolean;
  password?: string;
  maxConcurrentUsers?: number;
  expiresInHours?: number;
}

export interface ProcessShare {
  id: string;
  grid_id: string;
  process_id: string;
  owner_id: string;
  subdomain: string;
  custom_name: string;
  is_public: boolean;
  requires_password: boolean;
  max_concurrent_users: number;
  expires_at: string | null;
  total_visitors: number;
  created_at: string;
  share_url: string;
}

export interface SubdomainAvailabilityResponse {
  available: boolean;
  reason?: string;
  subdomain?: string;
}

/**
 * Check if a subdomain is available for use
 * @param subdomain The subdomain to check
 * @returns Promise with availability status
 */
export async function checkSubdomainAvailability(
  subdomain: string
): Promise<SubdomainAvailabilityResponse> {
  const response = await fetch(`${API_BASE}/share/check/${subdomain}`);
  if (!response.ok) {
    const text = await response.text();
    console.error('Subdomain check failed:', response.status, text);
    throw new Error(`Failed to check subdomain availability: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Non-JSON response:', text);
    throw new Error('Server returned non-JSON response');
  }

  return response.json();
}

/**
 * Create a new process share
 * @param token Authentication token
 * @param gridId Grid ID
 * @param processId Process ID
 * @param request Share creation request
 * @returns Promise with created share details
 */
export async function createProcessShare(
  token: string,
  gridId: string,
  processId: string,
  request: CreateProcessShareRequest
): Promise<ProcessShare> {
  const response = await fetch(
    `${API_BASE}/api/v1/grids/${gridId}/processes/${processId}/share`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create process share: ${error}`);
  }

  return response.json();
}

/**
 * Get details of an existing share
 * @param token Authentication token
 * @param shareId Share ID
 * @returns Promise with share details
 */
export async function getShareDetails(
  token: string,
  shareId: string
): Promise<ProcessShare> {
  const response = await fetch(`${API_BASE}/api/v1/shares/${shareId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get share details: ${error}`);
  }

  return response.json();
}

/**
 * Update an existing share
 * @param token Authentication token
 * @param shareId Share ID
 * @param request Update request
 * @returns Promise with update result
 */
export async function updateShare(
  token: string,
  shareId: string,
  request: Partial<CreateProcessShareRequest>
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/api/v1/shares/${shareId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update share: ${error}`);
  }

  return response.json();
}

/**
 * Delete a share
 * @param token Authentication token
 * @param shareId Share ID
 * @returns Promise with deletion result
 */
export async function deleteShare(
  token: string,
  shareId: string
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/api/v1/shares/${shareId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete share: ${error}`);
  }

  return response.json();
}

/**
 * Get all shares for a process
 * @param token Authentication token
 * @param gridId Grid ID
 * @param processId Process ID
 * @returns Promise with list of shares
 */
export async function getProcessShares(
  token: string,
  gridId: string,
  processId: string
): Promise<ProcessShare[]> {
  const response = await fetch(
    `${API_BASE}/api/v1/grids/${gridId}/processes/${processId}/shares`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get process shares: ${error}`);
  }

  return response.json();
}

// ============================================================================
// GRID SHARING API
// ============================================================================

export interface CreateGridShareRequest {
  grid_id: string;
  subdomain: string;
  display_name?: string;
  description?: string;
  is_public: boolean;
  requires_password: boolean;
  password?: string;
  max_concurrent_visitors?: number;
  expires_in_hours?: number;
}

export interface GridShare {
  id: string;
  grid_id: string;
  owner_id: string;
  subdomain: string;
  display_name: string;
  description: string;
  is_public: boolean;
  requires_password: boolean;
  max_concurrent_visitors: number;
  expires_at: string | null;
  total_visitors: number;
  created_at: string;
  share_url: string;
}

export interface AddProcessToShareRequest {
  process_id: string;
  custom_label?: string;
  exposed_port: number;
  override_traffic_type?: string;
}

export interface AddChannelToShareRequest {
  channel_id: string;
  custom_label?: string;
}

/**
 * Create a new grid share
 */
export async function createGridShare(
  token: string,
  request: CreateGridShareRequest
): Promise<GridShare> {
  const response = await fetch(`${API_BASE}/api/v1/grid-shares`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create grid share: ${error}`);
  }

  return response.json();
}

/**
 * List all grid shares for a grid
 */
export async function listGridShares(
  token: string,
  gridId: string
): Promise<GridShare[]> {
  const response = await fetch(`${API_BASE}/api/v1/grids/${gridId}/grid-shares`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list grid shares: ${error}`);
  }

  return response.json();
}

/**
 * Get grid share details
 */
export async function getGridShare(
  token: string,
  gridShareId: string
): Promise<GridShare> {
  const response = await fetch(`${API_BASE}/api/v1/grid-shares/${gridShareId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get grid share: ${error}`);
  }

  return response.json();
}

/**
 * Update grid share settings
 */
export async function updateGridShare(
  token: string,
  gridShareId: string,
  request: Partial<CreateGridShareRequest>
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/api/v1/grid-shares/${gridShareId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update grid share: ${error}`);
  }

  return response.json();
}

/**
 * Delete a grid share
 */
export async function deleteGridShare(
  token: string,
  gridShareId: string
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/api/v1/grid-shares/${gridShareId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete grid share: ${error}`);
  }

  return response.json();
}

/**
 * Add a process to a grid share
 */
export async function addProcessToGridShare(
  token: string,
  gridShareId: string,
  request: AddProcessToShareRequest
): Promise<{ status: string }> {
  const response = await fetch(
    `${API_BASE}/api/v1/grid-shares/${gridShareId}/processes`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add process to grid share: ${error}`);
  }

  return response.json();
}

/**
 * Add a channel to a grid share
 */
export async function addChannelToGridShare(
  token: string,
  gridShareId: string,
  request: AddChannelToShareRequest
): Promise<{ status: string }> {
  const response = await fetch(
    `${API_BASE}/api/v1/grid-shares/${gridShareId}/channels`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add channel to grid share: ${error}`);
  }

  return response.json();
}

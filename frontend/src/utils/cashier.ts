export type CashierCrew = {
    id: string;
    name: string;
    cashier_id: string | null;
};

export type CashierOverview = {
    location: { id: string; name: string };
    crew: CashierCrew[];
    integration: { enabled: boolean; available: boolean; message: string };
};

export type PushSellingCampaign = {
    id: number;
    location_id: string;
    plu: string;
    product_name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_by: { id: string; name: string };
    created_at: string | null;
    total_quantity: number | null;
    sales_available: boolean;
};

export type PushSellingCampaignInput = Pick<
    PushSellingCampaign,
    'plu' | 'product_name' | 'start_date' | 'end_date' | 'is_active'
>;

export type PushSellingSalesRow = {
    user_id: string;
    cashier_id: string;
    name: string;
    quantity: number;
};

export type PushSellingCampaignDetail = {
    campaign: PushSellingCampaign;
    sales: {
        available: boolean;
        total_quantity: number | null;
        last_synced_at: string | null;
        rows: PushSellingSalesRow[];
        message: string;
    };
};

export type CampaignPage = {
    data: PushSellingCampaign[];
    pagination: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

const headers = (json = false) => ({
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
});

async function readResponse<T>(response: Response): Promise<T> {
    if (response.ok) return response.json();

    try {
        const payload = await response.json();
        const validation = payload?.errors ? Object.values(payload.errors).flat().find(Boolean) : null;
        throw new Error(String(validation || payload?.message || 'Permintaan tidak dapat diproses.'));
    } catch (error) {
        if (error instanceof Error) throw error;
        throw new Error('Permintaan tidak dapat diproses.');
    }
}

export async function fetchCashierOverview(): Promise<CashierOverview> {
    return readResponse(await fetch('/api/supervisor/cashier', { headers: headers() }));
}

export async function saveCashierId(crewId: string, cashierId: string): Promise<CashierCrew> {
    const payload = await readResponse<{ crew: CashierCrew }>(await fetch(`/api/supervisor/cashier/crew/${encodeURIComponent(crewId)}`, {
        method: 'PATCH',
        headers: headers(true),
        body: JSON.stringify({ cashier_id: cashierId.trim() || null }),
    }));
    return payload.crew;
}

export async function fetchPushSellingCampaigns(
    search = '',
    status: 'all' | 'active' | 'inactive' = 'all',
    page = 1,
): Promise<CampaignPage> {
    const query = new URLSearchParams({ q: search, status, page: String(page), per_page: '10' });
    return readResponse(await fetch(`/api/supervisor/push-selling-campaigns?${query}`, { headers: headers() }));
}

export async function createPushSellingCampaign(input: PushSellingCampaignInput): Promise<PushSellingCampaign> {
    const payload = await readResponse<{ campaign: PushSellingCampaign }>(await fetch('/api/supervisor/push-selling-campaigns', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(input),
    }));
    return payload.campaign;
}

export async function updatePushSellingCampaign(id: number, input: PushSellingCampaignInput): Promise<PushSellingCampaign> {
    const payload = await readResponse<{ campaign: PushSellingCampaign }>(await fetch(`/api/supervisor/push-selling-campaigns/${id}`, {
        method: 'PATCH',
        headers: headers(true),
        body: JSON.stringify(input),
    }));
    return payload.campaign;
}

export async function fetchPushSellingCampaignDetail(id: number): Promise<PushSellingCampaignDetail> {
    return readResponse(await fetch(`/api/supervisor/push-selling-campaigns/${id}`, { headers: headers() }));
}

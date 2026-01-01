import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    // Get the 50 most recent submissions
    const submissionIds = await redis.zrange('contact:submissions', 0, 49, {
      rev: true,
    });

    if (!submissionIds || submissionIds.length === 0) {
      return NextResponse.json({ submissions: [] });
    }

    // Get all submission data
    const submissions = await Promise.all(
      submissionIds.map(async (id) => {
        const data = await redis.get(id as string);
        return {
          id,
          ...(typeof data === 'string' ? JSON.parse(data) : data),
        };
      })
    );

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

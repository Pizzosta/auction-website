import prisma from '../config/prisma.js';

// Maps REST query params to Prisma where/orderBy objects and returns {users, count}
export async function listUsersPrisma({
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
  status,
  search = '',
  role = '',
  isVerified,
  rating,
  lastActiveAfter,
  lastActiveBefore,
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  // Handle status filter (case-insensitive via normalization)
  if (status) {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'active') {
    where.isDeleted = { not: true };
    } else if (normalizedStatus === 'deleted') {
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no filter
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  if (role) where.role = role;
  if (typeof isVerified !== 'undefined') where.isVerified = isVerified === 'true' || isVerified === true;
  if (typeof rating !== 'undefined') where.rating = Number(rating);
  
  // Handle lastActiveAt filters
  if (lastActiveAfter || lastActiveBefore) {
    where.lastActiveAt = {};
    
    if (lastActiveAfter) {
      where.lastActiveAt.gte = new Date(lastActiveAfter);
    }
    
    if (lastActiveBefore) {
      where.lastActiveAt.lte = new Date(lastActiveBefore);
    }
  }

  if (search) {
    const s = String(search);
    where.OR = [
      { firstname: { contains: s, mode: 'insensitive' } },
      { lastname: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { username: { contains: s, mode: 'insensitive' } },
    ];
  }

  // Sort mapping
  let [field, order] = String(sort).split(':');
  if (!field) field = 'createdAt';
  const allowed = new Set(['firstname', 'lastname', 'email', 'phone', 'username', 'createdAt']);
  if (!allowed.has(field)) field = 'createdAt';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Fields to select (exclude passwordHash and sensitive tokens)
  const select = {
    id: true,
    createdAt: true,
    updatedAt: true,
    firstname: true,
    middlename: true,
    lastname: true,
    lastActiveAt: true,
    username: true,
    email: true,
    phone: true,
    role: true,
    rating: true,
    bio: true,
    location: true,
    isVerified: true,
    isDeleted: true,
    deletedAt: true,
    profilePicture: true,
    deletedBy: {
      select: {
        id: true,
        firstname: true,
        lastname: true,
        username: true,
      },
    },
  };

  const [count, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy, skip, take, select }),
  ]);

  // Ensure consistent profile picture structure
  const shaped = users.map(u => ({
    ...u,
    profilePicture: u.profilePicture || null
  }));

  return { users: shaped, count, pageNum, take };
}

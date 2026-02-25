// Simple in-memory cache to avoid regenerating URLs repeatedly
const UserAvatarCache = {};

export const getAvatarUrl = (user) => {
  if (!user) {
    return "";
  }

  // Handle /users/me format: profilePicture is an object with url property
  if (user.profilePicture && typeof user.profilePicture === "object") {
    if (typeof user.profilePicture.url === "string" && user.profilePicture.url.trim() !== "") {
      return user.profilePicture.url;
    }
  }

  // Handle /login format: profilePicture is a string URL directly
  if (typeof user.profilePicture === "string" && user.profilePicture.trim() !== "") {
    return user.profilePicture;
  }

  //User has no profile picture, fallback to cached robohash
  if (user.id) {
    // Clear cache if suspected stale data: delete UserAvatarCache[user.id];
    if (!UserAvatarCache[user.id]) {
      UserAvatarCache[user.id] = `https://robohash.org/${user.id}?bgset=bg1`;
    }
    return UserAvatarCache[user.id];
  }

  return ""; // Fallback if no user.id
};

// Utility to generate initials for default avatar
export const getInitials = (username) => {
  if (!username) return "U";
  const words = username.trim().split(/\s+/);
  return words.length > 1
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : username.slice(0, 2).toUpperCase();
};
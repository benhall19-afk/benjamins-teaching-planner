/**
 * Application Constants and Configuration
 */

// These should match actual series in Craft's Sermon Series collection
// They're used as fallback if the API doesn't return series
export const SERIES_OPTIONS = [
  "Christianity Explored",
  "How to Preach",
  "Preach the Gospel",
  "Prove the Gospel",
  "Protect the Gospel",
  "Creation to Christ",
  "God's Will For Your Life",
  "Be a Man",
  "2025 Character Series",
  "Filled with all the fullness of God"
];

export const THEME_OPTIONS = [
  "Faith",
  "Obedience",
  "Grace",
  "Worship",
  "Evangelism",
  "Discipleship",
  "Redemption",
  "Character",
  "Work & Purpose",
  "Community/Family",
  "New Creature in Christ"
];

export const AUDIENCE_OPTIONS = [
  "Adults",
  "Youth",
  "Mixed",
  "Families",
  "Men",
  "Women"
];

export const SEASON_OPTIONS = [
  "Easter",
  "Mother's Day",
  "Christmas",
  "New Year",
  "General",
  "Other Seasonal"
];

export const STATUS_OPTIONS = [
  "Draft",
  "in progress",
  "Complete",
  "Ready to Preach",
  "archive"
];

export const LESSON_TYPE_OPTIONS = [
  "Sermon",
  "Bible Lesson",
  "Short English Bible Lesson",
  "Devotional",
  "Young Children's Bible Lesson",
  "Video Lesson"
];

export const PREACHERS = [
  "Benjamin",
  "Boss",
  "Leo",
  "Diamond",
  "Thomas Tucker",
  "Shane",
  "George Hammett"
];

export const SPECIAL_EVENTS = [
  "Christmas",
  "Mothers Day",
  "Fathers Day",
  "Thanksgiving",
  "Resurrection Day",
  "New Years",
  "Baptism",
  "Thai Mothers Day"
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Default hashtag categories
export const HASHTAG_CATEGORIES = [
  {
    category: "Ministry & Practical Application",
    hashtags: "#topic/apologetics, #topic/bible-reading-plans, #topic/bilingual-ministry, #topic/discipleship-training, #topic/education, #topic/finances, #topic/goal-setting, #topic/mentoring, #topic/small-groups, #topic/sunday-school, #topic/witnessing, #topic/women-ministry, #topic/youth-ministry"
  },
  {
    category: "Character & Personal Development", 
    hashtags: "#topic/alertness, #topic/anger, #topic/character, #topic/child-training, #topic/contentment, #topic/courage, #topic/discipline, #topic/faithfulness, #topic/fear, #topic/generosity, #topic/honesty, #topic/humility, #topic/integrity, #topic/joy, #topic/kindness, #topic/leadership, #topic/love, #topic/patience, #topic/peace, #topic/pride, #topic/respect, #topic/responsibility, #topic/self-control, #topic/temptation, #topic/worry"
  },
  {
    category: "Biblical/Theological Topics",
    hashtags: "#topic/atonement, #topic/baptism, #topic/bible-authority, #topic/bible-study, #topic/church, #topic/discipleship, #topic/discernment, #topic/evangelism, #topic/faith, #topic/forgiveness, #topic/god's-will, #topic/gospel, #topic/grace, #topic/heaven, #topic/hell, #topic/holy-spirit, #topic/jesus, #topic/judgment, #topic/obedience, #topic/prayer, #topic/preaching, #topic/redemption, #topic/repentance, #topic/resurrection, #topic/salvation, #topic/sanctification, #topic/sin, #topic/walk-with-god, #topic/word-of-god"
  },
  {
    category: "Seasonal/Occasions",
    hashtags: "#topic/christmas, #topic/easter, #topic/new-year, #topic/thanksgiving"
  },
  {
    category: "Family & Relationships",
    hashtags: "#topic/child-training, #topic/family, #topic/husband-wife, #topic/marriage"
  }
];

export function getAllHashtags() {
  return HASHTAG_CATEGORIES.flatMap(c => c.hashtags.split(', '));
}

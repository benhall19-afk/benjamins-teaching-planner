/**
 * Application Constants and Configuration
 */

export const SERIES_OPTIONS = [
  "Foundational Discipleship",
  "Gospel & Redemption", 
  "Daily Christian Living",
  "Special & Seasonal",
  "Other"
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
  "Community/Family"
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
  "Complete",
  "Draft",
  "Needs Polish",
  "Ready to Preach"
];

export const LESSON_TYPE_OPTIONS = [
  "Sermon",
  "Devotional",
  "Young Children's Bible Lesson",
  "Short English Bible Lesson",
  "Bible Lesson"
];

export const SCHEDULE_LESSON_TYPES = [
  "Sermon AM",
  "Sermon PM",
  "Afternoon Study"
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
  "Baptism"
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

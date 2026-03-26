import type { VideoItem } from '../api'

/**
 * 与 prototype/home_dashboard 视觉一致的示例 Feed，缩略图与头像取自原型 HTML。
 * 每条绑定不同真实 YouTube id，点击播放为对应真实视频（标题可能与卡片文案不同）。
 */
export const DEMO_FEED_VIDEOS: VideoItem[] = [
  {
    sample: true,
    id: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Designing the Future: Neon Tech',
    channel: 'CineVision Pro',
    duration: 12 * 60 + 45,
    display_time: '2 days ago',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBzdaNZDMfoL6YW6FSTK3KiW_0UOpRwv9EhrWGh594UK_ldpg9lk9sX2LqrqcqAYJyQf4A9KZ5bcf2OQlnW3o3XgadcC49hnFW59NEQRuCQB32Y3wOWIj_uYfMTxfEss-SrGrOZGL6EMG6Gh5hM-o2QgJjex55_SaVPsZL1wIh7tHoO-W2IwEt120wuk0v4Dedq9lLXAqPUofij52JzBk1qNyzltnmhWhkd0kpsjr-pF6iOHFHZI5hG18LMkHfrf63qC6QVoa1NAj69',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAlyjDauV2nL_-SL96CORwrX00KK3FwfB0nSAPxBv4OLnDAaZEOtVJQ5xfTcLr9Jlzq1malSE5yxoiJ2uW0zhclCyB4RpKfbNy1flv0gJ8e8yUmmgFV88L7kjBPB6XqYH0lGtePItb-rnUMDzjbnUBo-wMGU2_lkzEaxdVqG3JfAZ2m3Xb6huOEMqgN09TNtG4py0rEGjlfpPHPbXM9_PLCno_DE2mFFlXiRZevDLgyDI-TAvL-3Yca02n0LSxvSaQzcIEiN_gyHvz7',
  },
  {
    sample: true,
    id: 'jNQXAC9IVRw',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    title: 'Melodic Shadows: Live Session',
    channel: 'Lumina Music',
    duration: 4 * 60 + 20,
    display_time: '5 hours ago',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDHVsHFqKb342xMdmiVQRkHStnkaA_m8pmjd2GCyd_KgnzjXa6Ma8bTrAm93s8n6pVvkGaSwfuPy68cT-8lu89GAObXkakbEiyCRR4ByIwx1_LvITldQXzA0Hs_4tuy0ukoXiGgnPsOovAQSwhgCSHw6FPXzKxESRAHGJeIDN02NF6AfSlVr4pFzIGJ1YFq08g_8pRQYa010gwPToh0qo2aDy3IGjMBp6PNNQmikUhw4lnBzXwi80Xuhh0ToJthCefvbSGntRIXOT0L',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCI6EWns9bxQWnq3jZabRUJq9mc0h5H_KQnVvATCjIEaJ3KxYqg8QDBhI15w5FdqAu2KM-8zUage3tpAZTgYqjFPXjrvHP34NilCvX2AoIs3LXSk0gEHjN7LUaBNT4vAwHgFaUKRcaLf9LlOAuWn72ukqOFaVJuc0ujAns3ojVmY2Km3nYbqDxqlV3H_a9bmZq6AFOSNaJmECjLNV1YEbJPi2V6cyRz6sdgGeC_wrCl7WoZc5qWn8CGYgbBh5qOYEv--w0eXUeVohnH',
  },
  {
    sample: true,
    id: 'L_jWHffIx5E',
    url: 'https://www.youtube.com/watch?v=L_jWHffIx5E',
    title: 'Camera Rigging Mastery',
    channel: 'The Build Lab',
    duration: 28 * 60 + 10,
    display_time: '1 week ago',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDvYyLHrpQMNfTu4aSchjFZcH1f7I5LitV-3vbe70p8zdoGiMjE2HyaxiU6h3hHY5Dn1oq_P5WV1yDC92XjHCoOU0qM8EVkA_irXxfuU2Wq5Uo-4WqkdnjhfosGZvsMd4o6OaGVn4GsKRae8ky4zxFvOnZ1y64EWKWH2YKuX_0BeETodlrOavMkhUCYUjeNFahI1s1ZZHp8CA39F3Oe15vwDF1swxUbihKPYct-bhzhyQzjqqgfvhATduUrxzqxrXdhGQIBM0yU0vc_',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDBDRDz_PUo_ey4MZo0ubNxlrxm3rEIQfNFc_vL0xWmWHC4JwG9GL9KtV9_fVQXLFJMPw0Pq1blIOVXzaY2kWVQ4-TQ2wkn1KIU1zMIi-nQebANXSNQGiFE-hQHa_Yp4TWPitXjgn4qOnEyBWEDB6q9Z4RdKcYBev-yKVbcb1WfTgreyJXG65UYbQ3XNvV4As0TEBEtRrB5wt0SJwowCPot89Fv61-7ZW3rmBj88hhnJeTjYi8Fu3dJrYPNNZUir88yWjCCIckYb4Kx',
  },
  {
    sample: true,
    id: '9bZkp7q19f0',
    url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    title: 'Abstract Flow: Color Theory',
    channel: 'YouTube Studio',
    duration: 2 * 60 + 55,
    display_time: 'Yesterday',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDb3rdUAg5ATT3ijHVEOnSc09_Q-GSbxm75o1nKvA78_NUn2lXbi0KoZ9G8FdaEi4tm3VfpmW5I6qFtISq9XMTD5KsKBfyqi8XorpKVr57mGxR10L5DJpSwVjmEQ_2M0sxCm1LsCjJFFvbaMnLYdnMKwxIv3JIvErIcEjKHM0vCPxLdSBfMp5CjW33Mv8eKzXSdY0EyYEDJJd80bqYRoSz1oX4gAL1O1CufeZfEQz-WjJ653axAOjREJmMDDW07fogbJIA_2BFFqOWW',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBqrAw0k0LRc7bZjnKeUzDw18lsFljTygUwVkTb1HZjUOSbyzkLdu6o1cZI8Ypky4LmB43WoTgLtC63CBaYwUGqjLhSP62L-BH56zPmz1j34yIJk00vD25samSxjA5_eTzCwWcpnluNluVU3rflQQRwoSNbhMtk62PPqeCn8wz1QJDTVdaOF7bN2ecmdxqrF6cy6ETKD4R3NFi08V-75q9v1G6JWyoGxfxT24IE1Bgcz-dsKVap2VQZ2VjEVQXC2IGx7QKFoo7N7FBX',
  },
  {
    sample: true,
    id: 'kJQP7kiw5Fk',
    url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    title: 'The Aesthetic of Analog Film',
    channel: 'Vintage Lens',
    duration: 15 * 60 + 30,
    display_time: '3 days ago',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBYcVS4Y0XRqoH3zgZ8uTb8QptJaqQ8cDJ1cPlAREonNPNgxDKbNFv3HQ2dnkA6hff8FJFvrDYeB1jxCnl7sABwFWkVXCHRvZjTSBKGCDZrwS6s6bRqkBmctVvp7NGmzMegZxs0F8exQxnJxZ-Ypzh57WC-lu8cgj99jE5ZEpW7GH8NF4LWuwQh72zn29annAJg3nZ4irXnOMdD1nEy0BFpYil4KP55Tn0ZKvWrwMiOwckgrwtPvLTZM6Y4UmHaFRBQ1hWyJVEjgiEv',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCYOzrqNhTXjAPz5rBH4AP6HBfNdOSlMkY3pNmIe4IxmYoZGDb7_XO5Xc1XO60itjR5yEdNkcJdNKoS4XBf_VILmw57R0Boaki4XE9sSmimMhJ5bZ7LC68nAprdoMSWKzzoXDPv34VJ1TiK_TfL0GMbvJiUkh3R_PsW4D8AEkEqEFM_zNyASHr6NdZyeFCJZVCIsuVX5VFNjTiM-9fYgeFVhgCx3oYbtLzxquHa0m6kslwND1E67tQjtPQA7MqI_VVFaOIHzCR_FFH6',
  },
  {
    sample: true,
    id: 'eVTXPUF4Oz4',
    url: 'https://www.youtube.com/watch?v=eVTXPUF4Oz4',
    title: 'Generative Art in Motion',
    channel: 'Digital Horizon',
    duration: 8 * 60 + 12,
    display_time: '2 weeks ago',
    thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC_x58ZPT39q_q7YfL4Rtbgp9dfWEP-ivVvx9Odo93R7_Gbanj3e25cEYyhKDvals3P04A55c3J7wbYnyPFdyP1ycqTBAST7zOL-2lBrWbB9sIR1KX7v99eARoKdiCCrbXcNMlLfdwjcvG2jUx56wdbUa45AYFFH0Y7w_yHwDbub0KtA9DDJvlFHXchA0ZkJB2zR5nTwsDYz1GpcZdxJr7AlIF5sAeYbCtjW_DslY0U32U6PJR6Jv2x0-Ck4U7LTSF9w_SHehBD3oVR',
    channel_thumbnail:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBu5dS36R-NH9q3Cz9ARUBkmL1xfzHJoFo_DpgkkPb7cRZJRQKBvHaRmyqi2juFgcB-Z3hO8_w35JAOGPHUVrG06jqEdlQCUDIFIiKfivOldlHgc8K0Nxu7ZV2A_eLZFXLRotrWJdCHmLSQbJcuAyBPw0JN3qC2vujxkKI13GQ52SSQXYnzS9HUkJicWdXDaiPGes2ccwwf6Fh6-O2nvFkasSToTM7t3hH656N3k_8Rm0A__iBswZRCodHpU2oV8O8I588uTS8BJBq5',
  },
]

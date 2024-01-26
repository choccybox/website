    // list of avatars
    var avatars = [
        "1.png",
        "2.png",
        "3.png",
        "4.png",
        "5.png",
        "6.png",
        "7.png",
        "8.png",
        "9.png",
    ];

    // randomly change avatar on each reload
    var avatar = avatars[Math.floor(Math.random() * avatars.length)];
    document.getElementById("avatar").src = "styles/avatars/" + avatar;
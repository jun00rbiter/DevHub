var LOGIN_COLOR_MAX = 9;

function ChatController(param){
  this.socket = param.socket;
  this.faviconNumber = param.faviconNumber;
  this.changedLoginName = param.changedLoginName;
  this.showRefPoint = param.showRefPoint;
  this.login_name = "";

  // Models
  this.loginElemList = [];
  this.hidingMessageCount = 0;
  this.filterName = "";

  this.chatViewModels = [];

  // initialize
  this.init_chat();
  this.init_settings();
  this.init_socket();
  this.init_dropzone();
}

ChatController.prototype = {
  setMessage: function(message){
    var exist_msg = $('#message').val();
    if ( exist_msg == ""){
      exist_msg += message + " ";
    }else{
      if (exist_msg.slice(-1) == " "){
        exist_msg += message + " ";
      }else{
        exist_msg += " " + message + " ";
      }
    }
    $('#message').focus().val(exist_msg).trigger('autosize.resize');
  },

  sendMessage: function(){
    var that = this;

    // 絵文字サジェストが表示中は送信しない
    if ($('.textcomplete-wrapper .dropdown-menu').css('display') == 'none'){
      var name = $('#name').val();
      var message = $('#message').val();
      var avatar = window.localStorage.avatarImage;

      if ( message && name ){
        var room_id = $("#chat_nav").find(".active").find("a").data("id");
        that.socket.emit('message', {name:name, avatar:avatar, room_id: room_id, msg:message});
        $('#message').attr('value', '').trigger('autosize.resize');

        if (that.login_name != name){
          that.login_name = name;
          that.changedLoginName(name);
        }
      }
      return false;
    }else{
      return true;
    }
  },

  init_chat: function(){
    var that = this;

    $('#message').textcomplete([
      {
        match: /\B:([\-+\w]*)$/,
        search: function (term, callback) {
          callback($.map(emojies, function (emoji) {
            return emoji.indexOf(term) === 0 ? emoji : null;
          }));
        },
        template: function (value) {
          return '<img class="emoji-suggest" src="img/emoji/' + value + '.png"></img> ' + value;
        },
        replace: function (value) {
          return ':' + value + ': ';
        },
        index: 1,
        maxCount: 8
      }
    ]).on('keydown',function(event){
      if(window.localStorage.sendkey == 'ctrl'){
        if ( event.ctrlKey && event.keyCode == 13) {
          return that.sendMessage();
        }
      }else if (window.localStorage.sendkey == 'shift'){
        if ( event.shiftKey && event.keyCode == 13) {
          return that.sendMessage();
        }
      }else{
        if ((event.altKey || event.ctrlKey || event.shiftKey ) && event.keyCode == 13) {
          return true;
        }else if(event.keyCode == 13){
          return that.sendMessage();
        }
      }

      return true;
    }).autosize();

    $('#send_button').click(function(){
      that.sendMessage();
      return false;
    });

    // ログインリストのバインディング
    $.templates("#loginNameTmpl").link("#login_list_body", that.loginElemList);
    $.templates("#alertTimelineTmpl").link("#alert_timeline", that);

    $('#chat_area').on('click', '.login-symbol', function(event){
      if (event.shiftKey == true ){
        $('#timeline_all').attr('checked', 'checked');
        $('#timeline_all').trigger("change");

        $.observable(that).setProperty("filterName", $(this).data("name"));
        $('.login-symbol:not([data-name="' + that.filterName + '"])').closest('li').hide();
        $('#filter_name_alert').slideDown();
        $('.tooltip').hide();
        $('#chat_area').scrollTop(0);
      }else{
        var name = $(this).data("name");
        that.setMessage("@" + name + "さん");
      }
    });

    // アップロードボタン
    $('#upload_chat_button').click(function(){
      $('#upload_chat').click();
      return false;
    });

    emojify.setConfig({
      img_dir: 'img/emoji',  // Directory for emoji images
    });

    // for chat list
    $.templates("#chatTabTmpl").link("#chat_nav", this.chatViewModels)
      .on('click', '.chat-tab-elem', function(){
        that.chatViewModels.forEach(function(vm){
          vm.set_active(false);
        });
        that.chatViewModels[$.view(this).getIndex()].set_active(true);
        return true;
      });
    $.templates("#chatTmpl").link(".chat-tab-content", this.chatViewModels)
      .on('inview', 'li:last-child', function(event, isInView, visiblePartX, visiblePartY) {
        console.log("inview");
        // ログ追加読み込みイベント
        if (!isInView){ return false; }

        var last_msg_id = $(this).data("id");
        that.chatViewModels[$.view(this).index].load_log_more(last_msg_id);
      })
      .on('click', '.remove_msg', function(){
        var data_id = $(this).closest('li').data('id');
        that.chatViewModels[$.view(this).index].remove_msg(data_id);
        return true;
      })
      .on('click', '.ref-point', function(){
        var id = $(this).attr("id");
        that.showRefPoint(id);
        return true;
      })
      .on('click', '.chat-list', function(){
        that.chatViewModels[$.view(this).index].clear_unread();
        return true;
      });
  },

  setName: function(name){
    this.login_name = name;
    $('#name').val(name);
    this.changedLoginName(name);
  },

  getName: function(){
    return this.login_name;
  },

  focus: function(){
    $('#message').focus().trigger('autosize.resize');
  },

  setWidth: function(width){
    $('#chat_area').css('width',width + 'px').css('margin',0);
  },

  init_socket: function(){
    var that = this;

    this.socket.on('remove_message', function(data) {
      $('#msg_' + data.id).fadeOut('normal',function(){
        $(this).remove();
      });
    });

    $('#chat_number').bind('change',function(){
      var num = $(this).val();
      socket.emit('chat_number', {num: num});
    });

    this.socket.on('chat_number', function(number) {
      $('#chat_number').val(number.num);
      that.chatViewModels.forEach(function(vm){
        vm.destroySocket();
      });
      $.observable(that.chatViewModels).refresh([]);
      for (var i = 1; i <= number.num; i++){
        $.observable(that.chatViewModels).insert(new ChatViewModel({
          no: i,
          socket: that.socket,
          get_id: function(name) {return that.get_id(name); },
          get_name: function() {return that.getName(); },
          faviconNumber: that.faviconNumber
        }));
      }

      $("#chat_tab_1").click();
    });

    this.socket.on('list', function(login_list) {
      $('#login_list_loader').hide();
      $('#login_list_body span[rel=tooltip]').tooltip('hide');

      var login_elems = [];
      var avatar_elems = [];
      for (var i = 0; i < login_list.length; ++i){
        var place = "";
        if ( login_list[i].place != "" ){
          place = "@" + login_list[i].place;
        }

        var login_elem = {
            id: login_list[i].id,
            color_id: "login-symbol login-elem login-name" + that.get_color_id_by_name_id(login_list[i].id),
            name: login_list[i].name,
            avatar: login_list[i].avatar,
            place: place,
            pomo_min: login_list[i].pomo_min
          };
        if (login_list[i].avatar != undefined && login_list[i].avatar != ""){
          avatar_elems.push(login_elem);
        }else{
          login_elems.push(login_elem);
        }
      }
      $.observable(that.loginElemList).refresh(avatar_elems.concat(login_elems));
      $('#login_list_body span[rel=tooltip]').tooltip({placement: 'bottom'});
    });
  },

  init_dropzone: function(){
    this.dropZone = new DropZone({
      dropTarget: $('#chat_area'),
      fileTarget: $('#upload_chat'),
      alertTarget: $('#loading'),
      pasteValid: true,
      uploadedAction: function(that, res){
        $('#message').val($('#message').val() + ' ' + res.fileName + ' ').trigger('autosize.resize');
      }
    });
  },

  get_color_id_by_name_id: function(id){
    if(id == 0){ return 0; } // no exist user.
    return id % LOGIN_COLOR_MAX + 1; // return 1 〜 LOGIN_COLOR_MAX
  },

  get_id: function(name){
    for(var i = 0; i < this.loginElemList.length; ++i ){
      if ( this.loginElemList[i].name == name ){
        return this.loginElemList[i].id;
      }
    }
    return 0;
  },

  init_settings: function(){
    var that = this;
    if(window.localStorage){
      if(window.localStorage.popupNotification == 'true'){
        $('#notify_all').attr('checked', 'checked');
      }else if (window.localStorage.popupNotification == 'mention'){
        $('#notify_mention').attr('checked', 'checked');
      }

      $('.notify-radio').on('change', "input", function(){
        var mode = $(this).val();
        window.localStorage.popupNotification = mode;
        if (mode != "disable"){
          if(Notification){
            Notification.requestPermission();
          }
        }
      });

      if (window.localStorage.notificationSeconds){
        $('#notification_seconds').val(window.localStorage.notificationSeconds);
      }else{
        $('#notification_seconds').val(5);
        window.localStorage.notificationSeconds = 5;
      }

      $('#notification_seconds').on('change',function(){
        window.localStorage.notificationSeconds = $(this).val();
      });

      // for avatar
      if (window.localStorage.avatarImage){
        $('#avatar').val(window.localStorage.avatarImage);
        $('#avatar_img').attr('src', window.localStorage.avatarImage);
      }

      $('#avatar_set').on('click',function(){
        window.localStorage.avatarImage = $('#avatar').val();
        $('#avatar_img').attr('src', window.localStorage.avatarImage);

        var name = $('#name').val();
        that.socket.emit('name',
          {
            name:name,
            avatar: window.localStorage.avatarImage
          });
        return false;
      });

      // for Timeline
      if(window.localStorage.timeline == 'own'){
        $('#timeline_own').attr('checked', 'checked');
        $('#mention_own_alert').show();
      }else if (window.localStorage.timeline == 'mention'){
        $('#timeline_mention').attr('checked', 'checked');
        $('#mention_alert').show();
      }else{
        $('#timeline_all').attr('checked', 'checked');
      }

      $('.timeline-radio').on('change', "input", function(){
        var mode = $(this).val();
        window.localStorage.timeline = mode;
        $('#list').empty();
        that.socket.emit('latest_log');
        $('#message_loader').show();

        if (mode == 'all'){
          $('#mention_own_alert').slideUp();
          $('#mention_alert').slideUp();
          $('#filter_name_alert').slideUp();
        }else if (mode == 'own'){
          $('#mention_own_alert').slideDown();
          $('#mention_alert').slideUp();
          $('#filter_name_alert').slideUp();
        }else{
          $('#mention_own_alert').slideUp();
          $('#mention_alert').slideDown();
          $('#filter_name_alert').slideUp();
        }
        $.observable(that).setProperty("hidingMessageCount", 0);
        $.observable(that).setProperty("filterName", "");
      });

      // for Send Message Key
      if(window.localStorage.sendkey == 'ctrl'){
        $('#send_ctrl').attr('checked', 'checked');
      }else if (window.localStorage.sendkey == 'shift'){
        $('#send_shift').attr('checked', 'checked');
      }else{
        $('#send_enter').attr('checked', 'checked');
      }

      $('.send-message-key-radio').on('change', "input", function(){
        var key = $(this).val();
        window.localStorage.sendkey = key;
      });

      $('#chat_body').on('click', '.close', function(){
        $('#timeline_all').attr('checked', 'checked');
        $('#timeline_all').trigger("change");
        return false;
      });
    }else{
      $('#notification').attr('disabled', 'disabled');
    }
  }
}

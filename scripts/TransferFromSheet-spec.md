- Lấy các địa chỉ trong input của tx lưu vào 1 array join với sender lưu vào mảng A
- Check các call transferFrom của BEP20 nếu có from trong mảng A và transfer amount > 0 thì lưu vào mảng B. Loại sender ra khỏi mảng B.
- Check các call nếu có call nào Precompiled recover sign với kết quả trả về địa chỉ trùng với sender của tx thì lưu vào C = true.
- Nếu B có length > 0 và C == true thì insert vào TransferFromSheet tại [https://docs.google.com/spreadsheets/d/1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs/edit?gid=720276546#gid=720276546]
<!-- - Check mảng B có length > 0 -->
